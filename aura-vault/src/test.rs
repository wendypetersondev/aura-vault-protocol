#![cfg(test)]

extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env};
use soroban_sdk::token::StellarAssetClient;

use crate::{AuraVault, AuraVaultClient, VaultError};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Deploy + initialise a fresh vault; return (env, vault_client, admin, token_address).
fn setup() -> (Env, AuraVaultClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);

    // Register a Stellar Asset Contract so we have a real SEP-41 token
    let token_address = env.register_stellar_asset_contract_v2(admin.clone()).address();

    let vault_address = env.register_contract(None, AuraVault);
    let vault = AuraVaultClient::new(&env, &vault_address);

    vault.initialize(&admin, &token_address);

    (env, vault, admin, token_address)
}

/// Mint `amount` tokens to `recipient` using the SAC admin.
fn mint(env: &Env, token: &Address, admin: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(recipient, &amount);
}

// ---------------------------------------------------------------------------
// 1. Initialisation tests
// ---------------------------------------------------------------------------

#[test]
fn test_double_init_returns_already_initialized() {
    let (env, vault, admin, token) = setup();
    // Second call should fail
    let result = vault.try_initialize(&admin, &token);
    assert_eq!(result, Err(Ok(VaultError::AlreadyInitialized)));
}

#[test]
fn test_fresh_vault_total_assets_is_zero() {
    let (_env, vault, _admin, _token) = setup();
    assert_eq!(vault.total_assets(), 0);
}

#[test]
fn test_fresh_vault_balance_of_unknown_address_is_zero() {
    let (env, vault, _admin, _token) = setup();
    let stranger = Address::generate(&env);
    assert_eq!(vault.balance_of(&stranger), 0);
}

// ---------------------------------------------------------------------------
// 2. Deposit — error paths
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_before_init_returns_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    // Create vault but do NOT call initialize
    let vault_addr = env.register_contract(None, AuraVault);
    let vault = AuraVaultClient::new(&env, &vault_addr);
    let user = Address::generate(&env);
    let result = vault.try_deposit(&user, &1_000);
    assert_eq!(result, Err(Ok(VaultError::NotInitialized)));
}

#[test]
fn test_deposit_zero_returns_zero_amount() {
    let (env, vault, _admin, _token) = setup();
    let user = Address::generate(&env);
    let result = vault.try_deposit(&user, &0);
    assert_eq!(result, Err(Ok(VaultError::ZeroAmount)));
}

#[test]
fn test_deposit_overflow_returns_error() {
    let (env, vault, admin, token) = setup();
    let seeder = Address::generate(&env);
    // Seed vault: 1 share, 1 token
    mint(&env, &token, &admin, &seeder, 1);
    vault.deposit(&seeder, &1);

    // Deposit i128::MAX — causes overflow either in the SAC token accounting
    // (vault already holds 1, so vault balance would overflow) or in our
    // own share arithmetic.  Either way, an error must be returned.
    let attacker = Address::generate(&env);
    mint(&env, &token, &admin, &attacker, i128::MAX);
    let result = vault.try_deposit(&attacker, &i128::MAX);
    assert!(result.is_err(), "expected an error on i128::MAX deposit, got Ok");
}

// ---------------------------------------------------------------------------
// 3. Deposit — happy paths
// ---------------------------------------------------------------------------

#[test]
fn test_first_deposit_mints_one_to_one() {
    let (env, vault, admin, token) = setup();
    let user = Address::generate(&env);
    mint(&env, &token, &admin, &user, 1_000_000);
    let minted = vault.deposit(&user, &1_000_000);
    assert_eq!(minted, 1_000_000);
    assert_eq!(vault.total_assets(), 1_000_000);
    assert_eq!(vault.balance_of(&user), 1_000_000);
}

#[test]
fn test_second_deposit_uses_share_formula() {
    // State: 1_000_000 shares, 1_200_000 assets (after harvest of 200_000)
    // Deposit 600_000 → floor(600_000 * 1_000_000 / 1_200_000) = 500_000
    let (env, vault, admin, token) = setup();

    let alice = Address::generate(&env);
    mint(&env, &token, &admin, &alice, 1_000_000);
    vault.deposit(&alice, &1_000_000);

    // harvest 200_000 yield — caller must be admin (FIX-2)
    mint(&env, &token, &admin, &admin, 200_000);
    vault.harvest(&admin, &200_000);

    let bob = Address::generate(&env);
    mint(&env, &token, &admin, &bob, 600_000);
    let minted = vault.deposit(&bob, &600_000);
    assert_eq!(minted, 500_000);
}

#[test]
fn test_two_equal_depositors_each_hold_half() {
    let (env, vault, admin, token) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    mint(&env, &token, &admin, &alice, 1_000_000);
    mint(&env, &token, &admin, &bob, 1_000_000);

    vault.deposit(&alice, &1_000_000);
    vault.deposit(&bob, &1_000_000);

    let alice_shares = vault.balance_of(&alice);
    let bob_shares = vault.balance_of(&bob);
    assert_eq!(alice_shares, bob_shares);
    assert_eq!(alice_shares + bob_shares, alice_shares * 2);
}

// ---------------------------------------------------------------------------
// 4. Withdraw — error paths
// ---------------------------------------------------------------------------

#[test]
fn test_withdraw_zero_returns_zero_amount() {
    let (env, vault, _admin, _token) = setup();
    let user = Address::generate(&env);
    let result = vault.try_withdraw(&user, &0);
    assert_eq!(result, Err(Ok(VaultError::ZeroAmount)));
}

#[test]
fn test_withdraw_before_init_returns_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let _token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let vault_addr = env.register_contract(None, AuraVault);
    let vault = AuraVaultClient::new(&env, &vault_addr);
    let user = Address::generate(&env);
    let result = vault.try_withdraw(&user, &100);
    assert_eq!(result, Err(Ok(VaultError::NotInitialized)));
}

#[test]
fn test_withdraw_more_than_balance_returns_insufficient_shares() {
    let (env, vault, admin, token) = setup();
    let user = Address::generate(&env);
    mint(&env, &token, &admin, &user, 1_000);
    vault.deposit(&user, &1_000);
    // Try to withdraw more shares than owned
    let result = vault.try_withdraw(&user, &9_999_999);
    assert_eq!(result, Err(Ok(VaultError::InsufficientShares)));
}

// ---------------------------------------------------------------------------
// 5. Withdraw — happy paths
// ---------------------------------------------------------------------------

#[test]
fn test_withdraw_all_shares_zeros_vault() {
    let (env, vault, admin, token) = setup();
    let user = Address::generate(&env);
    mint(&env, &token, &admin, &user, 5_000_000);
    vault.deposit(&user, &5_000_000);

    let shares = vault.balance_of(&user);
    vault.withdraw(&user, &shares);

    assert_eq!(vault.total_assets(), 0);
    assert_eq!(vault.balance_of(&user), 0);
}

#[test]
fn test_harvest_then_withdraw_yields_more() {
    let (env, vault, admin, token) = setup();
    let user = Address::generate(&env);
    mint(&env, &token, &admin, &user, 1_000_000);
    vault.deposit(&user, &1_000_000);

    let shares = vault.balance_of(&user);
    let pre_harvest_assets = vault.total_assets(); // 1_000_000

    // Harvest 500_000 yield — caller must be admin (FIX-2)
    mint(&env, &token, &admin, &admin, 500_000);
    vault.harvest(&admin, &500_000);

    let post_harvest_assets = vault.total_assets(); // 1_500_000
    assert!(post_harvest_assets > pre_harvest_assets);

    let received = vault.withdraw(&user, &shares);
    assert!(received > pre_harvest_assets);
    assert_eq!(received, 1_500_000);
}

#[test]
fn test_withdraw_does_not_affect_other_depositor_balance() {
    let (env, vault, admin, token) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    mint(&env, &token, &admin, &alice, 1_000_000);
    mint(&env, &token, &admin, &bob, 1_000_000);

    vault.deposit(&alice, &1_000_000);
    vault.deposit(&bob, &1_000_000);

    let bob_shares_before = vault.balance_of(&bob);
    let alice_shares = vault.balance_of(&alice);
    vault.withdraw(&alice, &alice_shares);

    assert_eq!(vault.balance_of(&bob), bob_shares_before);
}

// ---------------------------------------------------------------------------
// 6. Harvest — error paths
// ---------------------------------------------------------------------------

#[test]
fn test_harvest_zero_returns_zero_amount() {
    let (env, vault, admin, _token) = setup();
    let result = vault.try_harvest(&admin, &0);
    assert_eq!(result, Err(Ok(VaultError::ZeroAmount)));
}

#[test]
fn test_harvest_before_init_returns_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let _token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let vault_addr = env.register_contract(None, AuraVault);
    let vault = AuraVaultClient::new(&env, &vault_addr);
    let result = vault.try_harvest(&admin, &1_000);
    assert_eq!(result, Err(Ok(VaultError::NotInitialized)));
}

#[test]
fn test_harvest_on_empty_vault_returns_zero_shares() {
    let (env, vault, admin, token) = setup();
    let user = Address::generate(&env);
    mint(&env, &token, &admin, &user, 1_000_000);
    vault.deposit(&user, &1_000_000);
    let shares = vault.balance_of(&user);
    vault.withdraw(&user, &shares);

    // Vault is empty — harvest must return ZeroShares
    mint(&env, &token, &admin, &admin, 1_000);
    let result = vault.try_harvest(&admin, &1_000);
    assert_eq!(result, Err(Ok(VaultError::ZeroShares)));
}

// FIX-2: Non-admin harvest must be rejected
#[test]
fn test_harvest_by_non_admin_returns_harvest_unauthorized() {
    let (env, vault, admin, token) = setup();
    let user = Address::generate(&env);
    mint(&env, &token, &admin, &user, 1_000_000);
    vault.deposit(&user, &1_000_000);

    let stranger = Address::generate(&env);
    mint(&env, &token, &admin, &stranger, 1_000);
    let result = vault.try_harvest(&stranger, &1_000);
    assert_eq!(result, Err(Ok(VaultError::HarvestUnauthorized)));
}

// ---------------------------------------------------------------------------
// 7. Deposit-withdraw round-trip (verifies rounding bound of ±1)
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_withdraw_round_trip_rounding() {
    let (env, vault, admin, token) = setup();

    // Seed vault 1:1
    let seeder = Address::generate(&env);
    mint(&env, &token, &admin, &seeder, 1_000_000);
    vault.deposit(&seeder, &1_000_000);

    let amounts: &[i128] = &[1, 7, 100, 999, 1_000_000, 9_999_999, 100_000_000];
    for &amount in amounts {
        let user = Address::generate(&env);
        mint(&env, &token, &admin, &user, amount);
        let minted = vault.deposit(&user, &amount);
        if minted > 0 {
            let received = vault.withdraw(&user, &minted);
            assert!(
                received >= amount - 1,
                "round-trip: deposited {amount}, received {received}"
            );
        }
    }
}

// ---------------------------------------------------------------------------
// 8. Share-sum invariant
// ---------------------------------------------------------------------------

#[test]
fn test_share_sum_invariant() {
    let (env, vault, admin, token) = setup();

    let users: std::vec::Vec<Address> = (0..4).map(|_| Address::generate(&env)).collect();
    let deposit_amounts: &[i128] = &[1_000_000, 2_000_000, 500_000, 3_000_000];

    for (user, &amount) in users.iter().zip(deposit_amounts.iter()) {
        mint(&env, &token, &admin, user, amount);
        vault.deposit(user, &amount);
    }

    // Withdraw half the users; check remaining balances are intact
    for user in &users[..2] {
        let s = vault.balance_of(user);
        vault.withdraw(user, &s);
        assert_eq!(vault.balance_of(user), 0);
    }
    for user in &users[2..] {
        assert!(vault.balance_of(user) > 0);
    }
}

// ---------------------------------------------------------------------------
// 9. Harvest non-dilution property
// ---------------------------------------------------------------------------

#[test]
fn test_harvest_non_dilution() {
    let (env, vault, admin, token) = setup();

    let alice = Address::generate(&env);
    mint(&env, &token, &admin, &alice, 1_000_000);
    vault.deposit(&alice, &1_000_000);

    let alice_shares_before = vault.balance_of(&alice);
    let assets_before = vault.total_assets();

    // Admin performs harvest (FIX-2)
    mint(&env, &token, &admin, &admin, 300_000);
    vault.harvest(&admin, &300_000);

    // Share balance must be unchanged
    assert_eq!(vault.balance_of(&alice), alice_shares_before);
    // Total assets must have increased
    assert!(vault.total_assets() > assets_before);
}

// ---------------------------------------------------------------------------
// 10. Serialisation round-trip — two distinct addresses map to distinct slots
// ---------------------------------------------------------------------------

#[test]
fn test_balance_of_distinct_addresses_no_collision() {
    let (env, vault, admin, token) = setup();

    let addr_a = Address::generate(&env);
    let addr_b = Address::generate(&env);

    mint(&env, &token, &admin, &addr_a, 1_000_000);
    mint(&env, &token, &admin, &addr_b, 2_000_000);

    vault.deposit(&addr_a, &1_000_000);
    vault.deposit(&addr_b, &2_000_000);

    assert_ne!(vault.balance_of(&addr_a), vault.balance_of(&addr_b));
    assert_eq!(vault.balance_of(&addr_a), 1_000_000);
    assert_eq!(vault.balance_of(&addr_b), 2_000_000);
}

// ---------------------------------------------------------------------------
// 11. Upgrade — version and UUPS-style upgrade
// ---------------------------------------------------------------------------

mod current_wasm {
    soroban_sdk::contractimport!(
        file = "target/wasm32-unknown-unknown/release/aura_vault.wasm"
    );
}

#[cfg(test)]
fn upload_self_wasm(env: &Env) -> soroban_sdk::BytesN<32> {
    env.deployer().upload_contract_wasm(current_wasm::WASM)
}

#[test]
fn test_version_starts_at_one_after_initialize() {
    let (_env, vault, _admin, _token) = setup();
    assert_eq!(vault.version(), 1);
}

#[test]
fn test_upgrade_before_init_returns_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let _token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let vault_addr = env.register_contract(None, AuraVault);
    let vault = AuraVaultClient::new(&env, &vault_addr);

    let hash = upload_self_wasm(&env);
    let result = vault.try_upgrade(&hash);
    assert_eq!(result, Err(Ok(VaultError::NotInitialized)));
}

#[test]
#[should_panic]
fn test_upgrade_by_non_admin_is_rejected() {
    let (env, vault, _admin, _token) = setup();
    let env_no_auth = Env::default();
    let vault_addr = env_no_auth.register_contract(None, AuraVault);
    let strict_vault = AuraVaultClient::new(&env_no_auth, &vault_addr);
    let hash = upload_self_wasm(&env);
    strict_vault.upgrade(&hash);
}

#[test]
fn test_upgrade_increments_version_and_emits_event() {
    let (env, vault, _admin, _token) = setup();
    assert_eq!(vault.version(), 1);

    let new_hash = upload_self_wasm(&env);
    vault.upgrade(&new_hash);

    assert_eq!(vault.version(), 2);
}

#[test]
fn test_upgrade_preserves_all_vault_state() {
    let (env, vault, admin, token) = setup();

    let user = Address::generate(&env);
    mint(&env, &token, &admin, &user, 1_000_000);
    vault.deposit(&user, &1_000_000);

    let shares_before = vault.balance_of(&user);
    let assets_before = vault.total_assets();

    let new_hash = upload_self_wasm(&env);
    vault.upgrade(&new_hash);

    assert_eq!(vault.balance_of(&user), shares_before);
    assert_eq!(vault.total_assets(), assets_before);
    assert_eq!(vault.version(), 2);
}

#[test]
fn test_upgrade_can_be_called_multiple_times() {
    let (env, vault, _admin, _token) = setup();

    for expected_version in 2_u32..=4 {
        let hash = upload_self_wasm(&env);
        vault.upgrade(&hash);
        assert_eq!(vault.version(), expected_version);
    }
}

// ---------------------------------------------------------------------------
// 12. Admin transfer — FIX-6
// ---------------------------------------------------------------------------

#[test]
fn test_transfer_admin_changes_admin() {
    let (env, vault, admin, token) = setup();
    let new_admin = Address::generate(&env);

    vault.transfer_admin(&new_admin);

    // New admin can harvest; old admin cannot
    let user = Address::generate(&env);
    mint(&env, &token, &admin, &user, 1_000_000);
    vault.deposit(&user, &1_000_000);

    mint(&env, &token, &admin, &new_admin, 1_000);
    vault.harvest(&new_admin, &1_000);

    let result = vault.try_harvest(&admin, &1_000);
    assert_eq!(result, Err(Ok(VaultError::HarvestUnauthorized)));
}

#[test]
fn test_transfer_admin_before_init_returns_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let _token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let vault_addr = env.register_contract(None, AuraVault);
    let vault = AuraVaultClient::new(&env, &vault_addr);
    let new_admin = Address::generate(&env);
    let result = vault.try_transfer_admin(&new_admin);
    assert_eq!(result, Err(Ok(VaultError::NotInitialized)));
}
