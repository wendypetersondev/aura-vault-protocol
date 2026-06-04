use soroban_sdk::{contractspecentry, Address, Env};
use crate::errors::VaultError;

#[contractspecentry]
pub trait AuraVaultTrait {
    fn initialize(env: Env, admin: Address, underlying_token: Address) -> Result<(), VaultError>;
    fn deposit(env: Env, caller: Address, amount: i128) -> Result<i128, VaultError>;
    fn withdraw(env: Env, caller: Address, shares: i128) -> Result<i128, VaultError>;
    fn harvest(env: Env, caller: Address, yield_amount: i128) -> Result<(), VaultError>;
    fn total_assets(env: Env) -> i128;
    fn balance_of(env: Env, address: Address) -> i128;
}
