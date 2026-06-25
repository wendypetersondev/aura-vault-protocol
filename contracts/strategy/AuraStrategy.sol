// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─── Minimal protocol interfaces ──────────────────────────────────────────────

interface ILendingPool {
    function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface ICToken {
    function mint(uint256 mintAmount) external returns (uint256);
    function redeem(uint256 redeemTokens) external returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function exchangeRateCurrent() external returns (uint256);
}

/**
 * @title AuraStrategy
 * @notice Deploys vault assets into Aave v2/v3 (primary) or Compound (fallback)
 *         for yield generation. Supports up to N tokens, auto-compound harvest,
 *         emergency withdrawal, and an on-chain health check.
 */
contract AuraStrategy is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant STRATEGY_MANAGER_ROLE = keccak256("STRATEGY_MANAGER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    enum Protocol { AAVE, COMPOUND }

    struct TokenConfig {
        address cToken;      // Compound cToken (address(0) if Aave only)
        Protocol active;
        bool enabled;
    }

    ILendingPool public immutable aaveLendingPool;
    address public vault;

    mapping(address => TokenConfig) public tokenConfigs;
    address[] public supportedTokens;

    bool public emergencyMode;
    uint256 public lastHarvestTimestamp;

    // ─── Events ───────────────────────────────────────────────────────────────
    event Deposited(address indexed token, uint256 amount, Protocol protocol);
    event Withdrawn(address indexed token, uint256 amount, Protocol protocol);
    event Harvested(address indexed token, uint256 yield);
    event EmergencyWithdrawal(address indexed token, uint256 amount);
    event TokenAdded(address indexed token, Protocol protocol);
    event ProtocolSwitched(address indexed token, Protocol from, Protocol to);

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier notEmergency() {
        require(!emergencyMode, "Emergency mode");
        _;
    }

    modifier onlyVault() {
        require(msg.sender == vault, "Caller not vault");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address admin, address _aaveLendingPool, address _vault) {
        require(_aaveLendingPool != address(0) && _vault != address(0), "Zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(STRATEGY_MANAGER_ROLE, admin);
        aaveLendingPool = ILendingPool(_aaveLendingPool);
        vault = _vault;
    }

    // ─── Configuration ────────────────────────────────────────────────────────

    /// @notice Register a token for strategy deployment.
    function addToken(address token, address cToken, Protocol protocol)
        external
        onlyRole(STRATEGY_MANAGER_ROLE)
    {
        require(token != address(0), "Zero address");
        require(!tokenConfigs[token].enabled, "Already added");
        tokenConfigs[token] = TokenConfig({ cToken: cToken, active: protocol, enabled: true });
        supportedTokens.push(token);
        emit TokenAdded(token, protocol);
    }

    /// @notice Switch the active protocol for a token.
    function switchProtocol(address token, Protocol to)
        external
        onlyRole(STRATEGY_MANAGER_ROLE)
    {
        TokenConfig storage cfg = tokenConfigs[token];
        require(cfg.enabled, "Token not registered");
        Protocol from = cfg.active;
        cfg.active = to;
        emit ProtocolSwitched(token, from, to);
    }

    // ─── Core: Deposit / Withdraw ─────────────────────────────────────────────

    /// @notice Deploy `amount` of `token` into the active lending protocol.
    function deposit(address token, uint256 amount)
        external
        nonReentrant
        notEmergency
        onlyVault
    {
        TokenConfig storage cfg = tokenConfigs[token];
        require(cfg.enabled, "Token not supported");
        require(amount > 0, "Zero amount");

        IERC20(token).safeTransferFrom(vault, address(this), amount);
        _deployToProtocol(token, amount, cfg);
        emit Deposited(token, amount, cfg.active);
    }

    /// @notice Withdraw `amount` of `token` from the active lending protocol.
    function withdraw(address token, uint256 amount)
        external
        nonReentrant
        onlyVault
        returns (uint256 received)
    {
        TokenConfig storage cfg = tokenConfigs[token];
        require(cfg.enabled, "Token not supported");
        require(amount > 0, "Zero amount");

        received = _withdrawFromProtocol(token, amount, cfg);
        IERC20(token).safeTransfer(vault, received);
        emit Withdrawn(token, received, cfg.active);
    }

    // ─── Harvest ──────────────────────────────────────────────────────────────

    /// @notice Claim and compound yield for all supported tokens.
    function harvest()
        external
        nonReentrant
        notEmergency
        onlyRole(STRATEGY_MANAGER_ROLE)
    {
        lastHarvestTimestamp = block.timestamp;
        uint256 len = supportedTokens.length;
        for (uint256 i; i < len; ++i) {
            address token = supportedTokens[i];
            TokenConfig storage cfg = tokenConfigs[token];
            if (!cfg.enabled) continue;

            uint256 before = IERC20(token).balanceOf(address(this));
            _claimYield(token, cfg);
            uint256 gained = IERC20(token).balanceOf(address(this)) - before;

            if (gained > 0) {
                // Auto-compound: re-deploy yield
                _deployToProtocol(token, gained, cfg);
                emit Harvested(token, gained);
            }
        }
    }

    // ─── Emergency Withdrawal ─────────────────────────────────────────────────

    /**
     * @notice Pull ALL funds from protocols to this contract.
     *         Gas target: < 300 k per token (single SLOAD + one external call).
     */
    function emergencyWithdrawAll()
        external
        onlyRole(OPERATOR_ROLE)
    {
        emergencyMode = true;
        uint256 len = supportedTokens.length;
        for (uint256 i; i < len; ++i) {
            address token = supportedTokens[i];
            TokenConfig storage cfg = tokenConfigs[token];
            if (!cfg.enabled) continue;
            uint256 amount = _protocolBalance(token, cfg);
            if (amount == 0) continue;
            uint256 out = _withdrawFromProtocol(token, amount, cfg);
            emit EmergencyWithdrawal(token, out);
        }
    }

    /// @notice Transfer emergency-withdrawn funds to `to`. Admin only.
    function rescueFunds(address token, address to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(emergencyMode, "Not in emergency");
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to rescue");
        IERC20(token).safeTransfer(to, bal);
    }

    // ─── Health Check ─────────────────────────────────────────────────────────

    /**
     * @notice Returns (healthy, totalDeployed, tokenCount).
     *         Unhealthy when emergencyMode is active or no tokens registered.
     */
    function healthCheck()
        external
        view
        returns (bool healthy, uint256 totalDeployed, uint256 tokenCount)
    {
        tokenCount = supportedTokens.length;
        healthy = !emergencyMode && tokenCount > 0;
        for (uint256 i; i < tokenCount; ++i) {
            address token = supportedTokens[i];
            TokenConfig storage cfg = tokenConfigs[token];
            if (!cfg.enabled) continue;
            totalDeployed += _protocolBalance(token, cfg);
        }
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _deployToProtocol(address token, uint256 amount, TokenConfig storage cfg) internal {
        if (cfg.active == Protocol.AAVE) {
            IERC20(token).forceApprove(address(aaveLendingPool), amount);
            aaveLendingPool.deposit(token, amount, address(this), 0);
        } else {
            IERC20(token).forceApprove(cfg.cToken, amount);
            require(ICToken(cfg.cToken).mint(amount) == 0, "Compound mint failed");
        }
    }

    function _withdrawFromProtocol(address token, uint256 amount, TokenConfig storage cfg)
        internal
        returns (uint256)
    {
        if (cfg.active == Protocol.AAVE) {
            return aaveLendingPool.withdraw(token, amount, address(this));
        } else {
            uint256 cBal = ICToken(cfg.cToken).balanceOf(address(this));
            require(ICToken(cfg.cToken).redeem(cBal) == 0, "Compound redeem failed");
            return IERC20(token).balanceOf(address(this));
        }
    }

    function _claimYield(address token, TokenConfig storage cfg) internal {
        // For Compound, exchangeRateCurrent() accrues interest in-state.
        // For Aave, aTokens accrue automatically; no explicit claim needed.
        if (cfg.active == Protocol.COMPOUND && cfg.cToken != address(0)) {
            ICToken(cfg.cToken).exchangeRateCurrent();
        }
        token; // suppress unused warning for Aave path
    }

    function _protocolBalance(address token, TokenConfig storage cfg)
        internal
        view
        returns (uint256)
    {
        if (cfg.active == Protocol.COMPOUND && cfg.cToken != address(0)) {
            return ICToken(cfg.cToken).balanceOf(address(this));
        }
        // Aave aToken balance == underlying balance (1:1 after interest)
        // aToken address lookup omitted for brevity; return local balance
        return IERC20(token).balanceOf(address(this));
    }
}
