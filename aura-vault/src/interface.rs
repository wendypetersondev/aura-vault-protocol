use soroban_sdk::{contractspecentry, Address, Env, Vec, Symbol};
use crate::errors::VaultError;

/// Public ABI for AuraVault.  Implemented by the contract in lib.rs.
#[allow(dead_code)]
pub trait AuraVaultTrait {
    fn initialize(env: Env, admin: Address, underlying_token: Address, signers: Vec<Address>) -> Result<(), VaultError>;
    fn deposit(env: Env, caller: Address, amount: i128) -> Result<i128, VaultError>;
    fn withdraw(env: Env, caller: Address, shares: i128) -> Result<i128, VaultError>;
    fn harvest(env: Env, caller: Address, yield_amount: i128) -> Result<(), VaultError>;
    fn pause(env: Env) -> Result<(), VaultError>;
    fn unpause(env: Env) -> Result<(), VaultError>;
    fn is_paused(env: Env) -> bool;
    fn total_assets(env: Env) -> i128;
    fn balance_of(env: Env, address: Address) -> i128;
    fn propose_update_admin(env: Env, proposer: Address, new_admin: Address) -> Result<u64, VaultError>;
    fn propose_update_token(env: Env, proposer: Address, new_token: Address) -> Result<u64, VaultError>;
    fn propose_parameter_update(env: Env, proposer: Address, name: Symbol, value: i128) -> Result<u64, VaultError>;
    fn vote(env: Env, voter: Address, proposal_id: u64, approve: bool) -> Result<(), VaultError>;
    fn execute(env: Env, executor: Address, proposal_id: u64) -> Result<(), VaultError>;
    fn proposal_status(env: Env, proposal_id: u64) -> Option<String>;
}
