# Changelog

All notable changes to Aura Vault Protocol are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.2.0] — 2026-06-24

### Added
- **Frontend form validation** (`frontend/`) — zero-dependency browser UI for the Aura Vault registration flow.
  - Real-time field validation on `input` and `blur` events with per-field rules (username, email, password, confirm password).
  - Inline error messages with `aria-live` support for screen readers.
  - ✓ / ✗ success and error icons per field.
  - 5-level password strength meter scoring length, mixed case, digits, and special characters.
  - Phone input masking — formats digits as `+1 234 567 8900` on every keystroke.
  - Email domain autocomplete suggestions triggered after `@` (gmail.com, yahoo.com, outlook.com, proton.me, stellar.org).
  - Submit button disabled until all required fields pass validation.
  - Dark-themed UI (`styles.css`) consistent with Aura's aesthetic.

### Files Added
- `frontend/index.html`
- `frontend/validation.js`
- `frontend/styles.css`

---

## [0.1.0] — 2026-06-04

### Added
- **Aura Vault smart contract** — production-ready, share-based yield vault on Soroban (Stellar).
  - `initialize(admin, underlying_token)` — one-time vault setup.
  - `deposit(caller, amount)` — mint shares proportional to deposit; first depositor seeded at 1:1.
  - `withdraw(caller, shares)` — burn shares and redeem underlying tokens including accrued yield.
  - `harvest(caller, yield_amount)` — permissionless keeper injects yield without minting new shares, increasing the exchange rate for all shareholders.
  - `total_assets()` — gas-free read of total underlying tokens held.
  - `balance_of(address)` — gas-free read of share balance for any address.
- **Security properties**:
  - Checks-Effects-Interactions (CEI) ordering on all mutating functions.
  - Inflation attack prevention via zero-share mint rejection.
  - Overflow-safe arithmetic (`checked_mul` / `checked_div`; `overflow-checks = true` in release profile).
  - No `unwrap()` / `expect()` outside `#[cfg(test)]`.
  - Soroban archival safety — TTL extended on every mutating call (30-day lifetime, 7-day threshold).
- **8 typed error variants** (`VaultError`): `NotInitialized`, `AlreadyInitialized`, `InsufficientShares`, `InsufficientUnderlying`, `ZeroAmount`, `MathOverflow`, `InvalidAddress`, `ZeroShares`.
- **22 unit and integration tests** covering all contract functions and edge cases.
- **Contribution plan** (`plan.md`) — Wave development roadmap.

### Architecture
```
aura-vault/src/
├── lib.rs        # contract entrypoints
├── errors.rs     # VaultError enum
├── storage.rs    # DataKey, TTL helpers
├── interface.rs  # AuraVaultTrait ABI
└── test.rs       # 22 tests
```

---

## Breaking Changes

| Version | Change | Migration |
|---------|--------|-----------|
| —       | No breaking changes to date | — |

---

## Migration Guides

### 0.1.0 → 0.2.0
No on-chain changes. The `aura-vault` contract is unchanged.  
The `frontend/` directory is additive — no action required for existing deployments.

---

## Upcoming (Planned)

- Strategy layer — pluggable yield strategies (lending, liquidity provision).
- Fee module — configurable performance fee with fee-recipient distribution.
- Multi-asset support — multiple underlying tokens per vault instance.
- CLI deployment scripts — automated testnet/mainnet deploy helpers.

---

[Unreleased]: https://github.com/ComputerOracle/aura-vault-protocol/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ComputerOracle/aura-vault-protocol/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ComputerOracle/aura-vault-protocol/releases/tag/v0.1.0
