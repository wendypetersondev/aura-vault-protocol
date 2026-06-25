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
    get_total_deposited, get_total_shares, get_version, set_admin, set_balance,
    set_layout_version, set_token, set_total_deposited, set_total_shares, set_version,
    CURRENT_LAYOUT_VERSION,
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

        let total_shares = get_total_shares(&env);
        let total_deposited = get_total_deposited(&env);

        // Compute shares to mint (checked arithmetic, overflow returns MathOverflow)
        let new_shares: i128 = if total_shares == 0 || total_deposited == 0 {
            // 1:1 seeding — first depositor
            amount
        } else {
            let numerator = amount
                .checked_mul(total_shares)
                .ok_or(VaultError::MathOverflow)?;
            numerator
                .checked_div(total_deposited)
                .ok_or(VaultError::MathOverflow)?
        };

        // Inflation-attack fence: reject if formula rounds down to zero shares
        if new_shares <= 0 {
            return Err(VaultError::ZeroAmount);
        }

        // CEI — Interaction first: pull tokens from caller into vault
        let token_addr = get_token(&env).ok_or(VaultError::NotInitialized)?;
        token::Client::new(&env, &token_addr).transfer(
            &caller,
            &env.current_contract_address(),
            &amount,
        );

        // Effects: write state after successful transfer
        let old_balance = get_balance(&env, &caller);
        let new_balance = old_balance + new_shares;
        set_balance(&env, &caller, new_balance);
        let new_total_shares = total_shares
            .checked_add(new_shares)
            .ok_or(VaultError::MathOverflow)?;
        set_total_shares(&env, new_total_shares);
        let new_total_deposited = total_deposited
            .checked_add(amount)
            .ok_or(VaultError::MathOverflow)?;
        set_total_deposited(&env, new_total_deposited);

        bump_persistent(&env, &caller);
        bump_instance(&env);

        // FIX-3: Emit event for off-chain indexers and monitoring
        env.events().publish(
            (Symbol::new(&env, "deposit"),),
            (caller, amount, new_shares, new_total_shares, new_total_deposited),
        );

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

        let user_balance = get_balance(&env, &caller);
        if shares > user_balance {
            return Err(VaultError::InsufficientShares);
        }

        let total_shares = get_total_shares(&env);
        let total_deposited = get_total_deposited(&env);

        // Compute redemption amount
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
        let new_balance = user_balance - shares;
        set_balance(&env, &caller, new_balance);
        let new_total_shares = total_shares
            .checked_sub(shares)
            .ok_or(VaultError::MathOverflow)?;
        set_total_shares(&env, new_total_shares);
        let new_total_deposited = total_deposited
            .checked_sub(redeem_amount)
            .ok_or(VaultError::MathOverflow)?;
        set_total_deposited(&env, new_total_deposited);

        // Interaction: send tokens to caller after state is settled
        let token_addr = get_token(&env).ok_or(VaultError::NotInitialized)?;
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &caller,
            &redeem_amount,
        );

        bump_persistent(&env, &caller);
        bump_instance(&env);

        // FIX-3: Emit event for off-chain indexers and monitoring
        env.events().publish(
            (Symbol::new(&env, "withdraw"),),
            (caller, shares, redeem_amount, new_total_shares, new_total_deposited),
        );

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

        // FIX-2: Only the admin may call harvest.
        // Permissionless harvest allows any token-holder to inflate total_deposited
        // without sending real yield, or to grief by triggering dust rounding at
        // will.  Restricting to admin (or a keeper registry added later) closes
        // the open-access vector without affecting the happy-path workflow.
        let admin = get_admin(&env).ok_or(VaultError::NotInitialized)?;
        if caller != admin {
            return Err(VaultError::HarvestUnauthorized);
        }

        let total_shares = get_total_shares(&env);
        if total_shares == 0 {
            return Err(VaultError::ZeroShares);
        }

        let total_deposited = get_total_deposited(&env);
        let new_total = total_deposited
            .checked_add(yield_amount)
            .ok_or(VaultError::MathOverflow)?;

        // FIX-1: CEI — Effects before Interaction.
        // Original code wrote state AFTER the token transfer, violating CEI.
        // A re-entrant token could call harvest/deposit/withdraw again with
        // stale total_deposited, corrupting share accounting.
        set_total_deposited(&env, new_total);
        bump_instance(&env);

        // Interaction: pull yield tokens into vault (state already settled above)
        let token_addr = get_token(&env).ok_or(VaultError::NotInitialized)?;
        token::Client::new(&env, &token_addr).transfer(
            &caller,
            &env.current_contract_address(),
            &yield_amount,
        );

        // FIX-3: Emit event for off-chain indexers and monitoring
        env.events().publish(
            (Symbol::new(&env, "harvest"),),
            (caller, yield_amount, new_total),
        );

        Ok(())
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
    // transfer_admin — FIX-6: admin is no longer immutable
    // -----------------------------------------------------------------------
    /// Transfers admin role to `new_admin`.  Only the current admin may call
    /// this.  Emits a `admin_transferred` event so monitors can detect a
    /// privilege hand-off immediately.
    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), VaultError> {
        let admin = get_admin(&env).ok_or(VaultError::NotInitialized)?;
        admin.require_auth();

        set_admin(&env, &new_admin);
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "admin_transferred"),),
            (admin, new_admin),
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // upgrade — UUPS-style: admin-only Wasm replacement
    // -----------------------------------------------------------------------
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
