#![no_std]

mod errors;
mod interface;
mod storage;

pub use errors::VaultError;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, Symbol};

use storage::{
    bump_instance, bump_persistent, get_admin, get_balance, get_layout_version, get_token,
    get_total_deposited, get_total_shares, get_version, is_paused as storage_is_paused, set_admin,
    set_balance, set_layout_version, set_paused, set_token, set_total_deposited, set_total_shares,
    set_version, CURRENT_LAYOUT_VERSION,
};

#[contract]
pub struct AuraVault;

#[contractimpl]
impl AuraVault {
    // -----------------------------------------------------------------------
    // initialize
    // -----------------------------------------------------------------------
    pub fn initialize(
        env: Env,
        admin: Address,
        underlying_token: Address,
    ) -> Result<(), VaultError> {
        if get_admin(&env).is_some() {
            return Err(VaultError::AlreadyInitialized);
        }
        set_admin(&env, &admin);
        set_token(&env, &underlying_token);
        set_total_shares(&env, 0);
        set_total_deposited(&env, 0);
        set_version(&env, 1);
        set_layout_version(&env, CURRENT_LAYOUT_VERSION);
        bump_instance(&env);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // deposit
    // -----------------------------------------------------------------------
    pub fn deposit(env: Env, caller: Address, amount: i128) -> Result<i128, VaultError> {
        caller.require_auth();

        if amount <= 0 {
            return Err(VaultError::ZeroAmount);
        }
        if get_admin(&env).is_none() {
            return Err(VaultError::NotInitialized);
        }
        if storage_is_paused(&env) {
            return Err(VaultError::VaultPaused);
        }

        let token_addr = get_token(&env).ok_or(VaultError::NotInitialized)?;
        let token = token::Client::new(&env, &token_addr);

        // Flash-loan guard: actual token balance must equal tracked state before deposit.
        let balance_before = token.balance(&env.current_contract_address());
        let total_deposited = get_total_deposited(&env);
        if balance_before != total_deposited {
            env.events().publish(
                (Symbol::new(&env, "suspicious"),),
                (Symbol::new(&env, "balance_mismatch"), balance_before, total_deposited),
            );
            return Err(VaultError::BalanceMismatch);
        }

        let total_shares = get_total_shares(&env);

        // Compute shares to mint (checked arithmetic, overflow returns MathOverflow)
        let new_shares: i128 = if total_shares == 0 || total_deposited == 0 {
            amount
        } else {
            let numerator = amount
                .checked_mul(total_shares)
                .ok_or(VaultError::MathOverflow)?;
            numerator
                .checked_div(total_deposited)
                .ok_or(VaultError::MathOverflow)?
        };

        if new_shares <= 0 {
            return Err(VaultError::ZeroAmount);
        }

        // CEI — Interaction: pull tokens from caller into vault
        token.transfer(&caller, &env.current_contract_address(), &amount);

        // Effects: write state after successful transfer
        let old_balance = get_balance(&env, &caller);
        set_balance(&env, &caller, old_balance + new_shares);
        set_total_shares(
            &env,
            total_shares
                .checked_add(new_shares)
                .ok_or(VaultError::MathOverflow)?,
        );
        set_total_deposited(
            &env,
            total_deposited
                .checked_add(amount)
                .ok_or(VaultError::MathOverflow)?,
        );

        env.events().publish(
            (Symbol::new(&env, "deposit"),),
            (caller, amount, new_shares),
        );

        bump_persistent(&env, &caller);
        bump_instance(&env);

        Ok(new_shares)
    }

    // -----------------------------------------------------------------------
    // withdraw
    // -----------------------------------------------------------------------
    pub fn withdraw(env: Env, caller: Address, shares: i128) -> Result<i128, VaultError> {
        caller.require_auth();

        if shares <= 0 {
            return Err(VaultError::ZeroAmount);
        }
        if get_admin(&env).is_none() {
            return Err(VaultError::NotInitialized);
        }
        if storage_is_paused(&env) {
            return Err(VaultError::VaultPaused);
        }

        let token_addr = get_token(&env).ok_or(VaultError::NotInitialized)?;
        let token = token::Client::new(&env, &token_addr);

        // Flash-loan guard: actual token balance must equal tracked state.
        let balance_before = token.balance(&env.current_contract_address());
        let total_deposited = get_total_deposited(&env);
        if balance_before != total_deposited {
            env.events().publish(
                (Symbol::new(&env, "suspicious"),),
                (Symbol::new(&env, "balance_mismatch"), balance_before, total_deposited),
            );
            return Err(VaultError::BalanceMismatch);
        }

        let user_balance = get_balance(&env, &caller);
        if shares > user_balance {
            return Err(VaultError::InsufficientShares);
        }

        let total_shares = get_total_shares(&env);

        let numerator = shares
            .checked_mul(total_deposited)
            .ok_or(VaultError::MathOverflow)?;
        let redeem_amount = numerator
            .checked_div(total_shares)
            .ok_or(VaultError::MathOverflow)?;

        if redeem_amount <= 0 {
            return Err(VaultError::ZeroAmount);
        }
        if total_deposited < redeem_amount {
            return Err(VaultError::InsufficientUnderlying);
        }

        // CEI — Effects first: burn shares before token transfer
        set_balance(&env, &caller, user_balance - shares);
        set_total_shares(
            &env,
            total_shares
                .checked_sub(shares)
                .ok_or(VaultError::MathOverflow)?,
        );
        set_total_deposited(
            &env,
            total_deposited
                .checked_sub(redeem_amount)
                .ok_or(VaultError::MathOverflow)?,
        );

        // Interaction: send tokens to caller after state is settled
        token.transfer(&env.current_contract_address(), &caller, &redeem_amount);

        env.events().publish(
            (Symbol::new(&env, "withdraw"),),
            (caller, shares, redeem_amount),
        );

        bump_persistent(&env, &caller);
        bump_instance(&env);

        Ok(redeem_amount)
    }

    // -----------------------------------------------------------------------
    // harvest
    // -----------------------------------------------------------------------
    pub fn harvest(env: Env, caller: Address, yield_amount: i128) -> Result<(), VaultError> {
        caller.require_auth();

        if yield_amount <= 0 {
            return Err(VaultError::ZeroAmount);
        }
        if get_admin(&env).is_none() {
            return Err(VaultError::NotInitialized);
        }
        if storage_is_paused(&env) {
            return Err(VaultError::VaultPaused);
        }

        let total_shares = get_total_shares(&env);
        if total_shares == 0 {
            return Err(VaultError::ZeroShares);
        }

        let total_deposited = get_total_deposited(&env);

        let token_addr = get_token(&env).ok_or(VaultError::NotInitialized)?;
        let token = token::Client::new(&env, &token_addr);

        // Flash-loan guard: actual token balance must equal tracked state before harvest.
        let balance_before = token.balance(&env.current_contract_address());
        if balance_before != total_deposited {
            env.events().publish(
                (Symbol::new(&env, "suspicious"),),
                (Symbol::new(&env, "balance_mismatch"), balance_before, total_deposited),
            );
            return Err(VaultError::BalanceMismatch);
        }

        let new_total = total_deposited
            .checked_add(yield_amount)
            .ok_or(VaultError::MathOverflow)?;

        // Interaction: pull yield tokens into vault
        token.transfer(&caller, &env.current_contract_address(), &yield_amount);

        // Effect: increase total deposited — no new shares minted
        set_total_deposited(&env, new_total);

        env.events().publish(
            (Symbol::new(&env, "harvest"),),
            (caller, yield_amount),
        );

        bump_instance(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // pause / unpause — admin-only emergency controls
    // -----------------------------------------------------------------------
    pub fn pause(env: Env) -> Result<(), VaultError> {
        let admin = get_admin(&env).ok_or(VaultError::NotInitialized)?;
        admin.require_auth();
        set_paused(&env, true);
        env.events().publish((Symbol::new(&env, "paused"),), ());
        bump_instance(&env);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), VaultError> {
        let admin = get_admin(&env).ok_or(VaultError::NotInitialized)?;
        admin.require_auth();
        set_paused(&env, false);
        env.events().publish((Symbol::new(&env, "unpaused"),), ());
        bump_instance(&env);
        Ok(())
    }

    pub fn is_paused(env: Env) -> bool {
        storage_is_paused(&env)
    }

    // -----------------------------------------------------------------------
    // total_assets  (read-only — no bumps, no writes)
    // -----------------------------------------------------------------------
    pub fn total_assets(env: Env) -> i128 {
        get_total_deposited(&env)
    }

    // -----------------------------------------------------------------------
    // balance_of  (read-only — no bumps, no writes)
    // -----------------------------------------------------------------------
    pub fn balance_of(env: Env, address: Address) -> i128 {
        get_balance(&env, &address)
    }

    // -----------------------------------------------------------------------
    // upgrade — UUPS-style: admin-only Wasm replacement
    // -----------------------------------------------------------------------
    /// Replaces the contract's Wasm with `new_wasm_hash`.
    ///
    /// Authorization model (UUPS): the upgrade logic lives inside the contract
    /// itself — only the stored admin may trigger it, mirroring the UUPS
    /// pattern on EVM where the proxy logic is in the implementation contract.
    ///
    /// Storage-layout guard: the on-chain `LayoutVersion` must equal
    /// `CURRENT_LAYOUT_VERSION`.  If a future Wasm bump changes the meaning
    /// of any `DataKey` variant it must also bump `CURRENT_LAYOUT_VERSION`,
    /// making the mismatch detectable before the Wasm swap goes live.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), VaultError> {
        // 1. Must be initialized
        let admin = get_admin(&env).ok_or(VaultError::NotInitialized)?;

        // 2. Admin-only authorization
        admin.require_auth();

        // 3. Layout compatibility guard
        if get_layout_version(&env) != CURRENT_LAYOUT_VERSION {
            return Err(VaultError::StorageLayoutMismatch);
        }

        // 4. Effects: bump version before Wasm swap
        let next_version = get_version(&env)
            .checked_add(1)
            .ok_or(VaultError::MathOverflow)?;
        set_version(&env, next_version);
        bump_instance(&env);

        // 5. Emit upgrade event BEFORE swap (still in current Wasm execution context)
        env.events().publish(
            (Symbol::new(&env, "upgrade"),),
            (admin, next_version, new_wasm_hash.clone()),
        );

        // 6. Interaction: atomic Wasm replacement (point of no return)
        env.deployer().update_current_contract_wasm(new_wasm_hash);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // version  (read-only)
    // -----------------------------------------------------------------------
    pub fn version(env: Env) -> u32 {
        get_version(&env)
    }
}
