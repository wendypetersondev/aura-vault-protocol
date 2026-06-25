#![no_std]

mod errors;
mod interface;
mod storage;
mod governance;

pub use errors::VaultError;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, token, Address, Env, Vec, Symbol};

use storage::{
    bump_instance, bump_persistent, get_admin, get_balance, get_token, get_total_deposited,
    get_total_shares, set_admin, set_balance, set_token, set_total_deposited, set_total_shares,
};
use governance::{
    initialize_governance, create_proposal, vote_on_proposal, execute_proposal,
    get_proposal_status, ProposalStatus, ProposalType,
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
        signers: Vec<Address>,
    ) -> Result<(), VaultError> {
        if get_admin(&env).is_some() {
            return Err(VaultError::AlreadyInitialized);
        }
        set_admin(&env, &admin);
        set_token(&env, &underlying_token);
        set_total_shares(&env, 0);
        set_total_deposited(&env, 0);
        initialize_governance(&env, signers)?;
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
        let token_addr = get_token(&env).ok_or(VaultError::NotInitialized)?;
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &caller,
            &redeem_amount,
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

        let total_shares = get_total_shares(&env);
        if total_shares == 0 {
            return Err(VaultError::ZeroShares);
        }

        let total_deposited = get_total_deposited(&env);
        let new_total = total_deposited
            .checked_add(yield_amount)
            .ok_or(VaultError::MathOverflow)?;

        // Interaction: pull yield tokens into vault
        let token_addr = get_token(&env).ok_or(VaultError::NotInitialized)?;
        token::Client::new(&env, &token_addr).transfer(
            &caller,
            &env.current_contract_address(),
            &yield_amount,
        );

        // Effect: increase total deposited — no new shares minted
        set_total_deposited(&env, new_total);
        bump_instance(&env);

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
    // Governance Methods
    // -----------------------------------------------------------------------

    pub fn propose_update_admin(env: Env, proposer: Address, new_admin: Address) -> Result<u64, VaultError> {
        create_proposal(&env, proposer, ProposalType::UpdateAdmin)
    }

    pub fn propose_update_token(env: Env, proposer: Address, new_token: Address) -> Result<u64, VaultError> {
        create_proposal(&env, proposer, ProposalType::UpdateUnderlyingToken)
    }

    pub fn propose_parameter_update(
        env: Env,
        proposer: Address,
        name: Symbol,
        value: i128,
    ) -> Result<u64, VaultError> {
        create_proposal(&env, proposer, ProposalType::UpdateParameter { name, value })
    }

    pub fn vote(
        env: Env,
        voter: Address,
        proposal_id: u64,
        approve: bool,
    ) -> Result<(), VaultError> {
        vote_on_proposal(&env, voter, proposal_id, approve)
    }

    pub fn execute(
        env: Env,
        executor: Address,
        proposal_id: u64,
    ) -> Result<(), VaultError> {
        execute_proposal(&env, executor, proposal_id)?;
        bump_instance(&env);
        Ok(())
    }

    pub fn proposal_status(env: Env, proposal_id: u64) -> Option<String> {
        get_proposal_status(&env, proposal_id).map(|status| {
            match status {
                ProposalStatus::Pending => "Pending".to_string(),
                ProposalStatus::Approved => "Approved".to_string(),
                ProposalStatus::Executed => "Executed".to_string(),
                ProposalStatus::Rejected => "Rejected".to_string(),
            }
        })
    }
}
