# Aura Vault — Smart Contract API Reference

> **Contract**: `AuraVault`  
> **Platform**: [Soroban](https://soroban.stellar.org) (Stellar)  
> **Language**: Rust (`no_std`)  
> **Source**: `aura-vault/src/lib.rs`

---

## Table of Contents

1. [Overview](#overview)
2. [Public Functions](#public-functions)
   - [initialize](#initialize)
   - [deposit](#deposit)
   - [withdraw](#withdraw)
   - [harvest](#harvest)
   - [pause](#pause)
   - [unpause](#unpause)
   - [is_paused](#is_paused)
   - [total_assets](#total_assets)
   - [balance_of](#balance_of)
   - [transfer_admin](#transfer_admin)
   - [upgrade](#upgrade)
   - [version](#version)
   - [set_fees](#set_fees)
   - [set_treasury](#set_treasury)
   - [get_fees](#get_fees)
   - [total_fees_collected](#total_fees_collected)
   - [withdraw_fees](#withdraw_fees)
3. [Error Codes](#error-codes)
4. [Events](#events)
5. [Security Model](#security-model)
6. [Gas / Resource Notes](#gas--resource-notes)

---

## Overview

`AuraVault` is a share-based yield vault built on Soroban. It accepts deposits
of a single SEP-41-compatible underlying token, issues proportional vault
shares to depositors, and allows the admin/keeper to compound yield via
`harvest`. All arithmetic uses checked operations; the contract enforces a
flash-loan guard on every mutating call.

### Share Pricing

| Scenario | Formula |
|---|---|
| First depositor (empty vault) | `shares = amount` (1:1 seed) |
| Subsequent depositors | `shares = floor(amount × total_shares / total_assets)` |
| Redemption | `tokens = floor(shares × total_assets / total_shares)` |

---

## Public Functions

### `initialize`

One-time vault setup. Stores the admin address and the underlying token
address. Must be called before any other mutating function.

**Signature**

```rust
pub fn initialize(
    env: Env,
    admin: Address,
    underlying_token: Address,
) -> Result<(), VaultError>
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `admin` | `Address` | Account that can call `pause`, `unpause`, `harvest`, `upgrade`, `set_fees`, `set_treasury`, `withdraw_fees`, and `transfer_admin`. |
| `underlying_token` | `Address` | SEP-41 token contract address accepted for deposits. |

**Returns** `Ok(())` on success.

**Errors**

| Error | Condition |
|---|---|
| `AlreadyInitialized` | `initialize` has already been called. |

**Example (Stellar CLI)**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_KEYPAIR> \
  --network testnet \
  -- initialize \
  --admin GABCDE... \
  --underlying_token CTOKEN...
```

---

### `deposit`

Transfer underlying tokens into the vault and receive proportional vault shares.

**Signature**

```rust
pub fn deposit(
    env: Env,
    caller: Address,
    amount: i128,
) -> Result<i128, VaultError>
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `caller` | `Address` | Depositor. Must sign the transaction (`require_auth`). |
| `amount` | `i128` | Number of underlying tokens to deposit. Must be > 0. |

**Returns** `Ok(shares_minted: i128)` — number of vault shares issued to `caller`.

**Errors**

| Error | Condition |
|---|---|
| `ZeroAmount` | `amount ≤ 0` or computed shares round to 0. |
| `NotInitialized` | Vault has not been initialized. |
| `VaultPaused` | Vault is currently paused. |
| `BalanceMismatch` | Flash-loan guard: actual token balance ≠ `total_deposited`. |
| `MathOverflow` | Arithmetic overflow during share calculation. |

**Events emitted**

```
topic: ("deposit",)
data:  (caller: Address, amount: i128, shares: i128, total_shares: i128, total_deposited: i128)
```

**Example (Stellar CLI)**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <USER_KEYPAIR> \
  --network testnet \
  -- deposit \
  --caller GUSER... \
  --amount 1000000
```

**Example (JavaScript SDK)**

```ts
import { Contract, TransactionBuilder, Networks, BASE_FEE } from "@stellar/stellar-sdk";

const result = await contract.call("deposit", {
  caller: userKeypair.publicKey(),
  amount: BigInt(1_000_000),
});
// result.value === shares minted (i128 as BigInt)
```

---

### `withdraw`

Burn vault shares and receive the proportional share of underlying tokens.

**Signature**

```rust
pub fn withdraw(
    env: Env,
    caller: Address,
    shares: i128,
) -> Result<i128, VaultError>
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `caller` | `Address` | Share holder. Must sign the transaction. |
| `shares` | `i128` | Number of vault shares to burn. Must be > 0 and ≤ caller's balance. |

**Returns** `Ok(tokens_redeemed: i128)` — underlying tokens transferred to `caller`.

**Errors**

| Error | Condition |
|---|---|
| `ZeroAmount` | `shares ≤ 0` or redeemable tokens round to 0. |
| `NotInitialized` | Vault not initialized. |
| `VaultPaused` | Vault is paused. |
| `InsufficientShares` | `shares > caller's balance`. |
| `InsufficientUnderlying` | Vault cannot cover the redemption (rounding edge case). |
| `BalanceMismatch` | Flash-loan guard triggered. |
| `MathOverflow` | Arithmetic overflow. |

**Events emitted**

```
topic: ("withdraw",)
data:  (caller: Address, shares: i128, redeemed: i128, total_shares: i128, total_deposited: i128)
```

**Example (Stellar CLI)**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <USER_KEYPAIR> \
  --network testnet \
  -- withdraw \
  --caller GUSER... \
  --shares 500000
```

**Example (JavaScript SDK)**

```ts
const result = await contract.call("withdraw", {
  caller: userKeypair.publicKey(),
  shares: BigInt(500_000),
});
// result.value === underlying tokens redeemed (i128 as BigInt)
```

---

### `harvest`

Inject yield tokens into the vault without minting new shares. This increases
the redemption value of every existing share. Only the **admin** may call this.

**Signature**

```rust
pub fn harvest(
    env: Env,
    caller: Address,
    yield_amount: i128,
) -> Result<(), VaultError>
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `caller` | `Address` | Must equal the vault admin. Must sign the transaction. |
| `yield_amount` | `i128` | Yield tokens to transfer into the vault. Must be > 0. |

**Returns** `Ok(())` on success.

**Errors**

| Error | Condition |
|---|---|
| `ZeroAmount` | `yield_amount ≤ 0`. |
| `NotInitialized` | Vault not initialized. |
| `VaultPaused` | Vault is paused. |
| `HarvestUnauthorized` | Caller is not the admin. |
| `ZeroShares` | No shares exist; yield would be unattributable. |
| `BalanceMismatch` | Flash-loan guard triggered. |
| `MathOverflow` | Arithmetic overflow. |

**Events emitted**

```
topic: ("harvest",)
data:  (caller: Address, yield_amount: i128)
```

**Example (Stellar CLI)**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_KEYPAIR> \
  --network testnet \
  -- harvest \
  --caller GADMIN... \
  --yield_amount 50000
```

**Example (JavaScript SDK)**

```ts
// Only the admin keypair will pass require_auth
const result = await contract.call("harvest", {
  caller: adminKeypair.publicKey(),
  yield_amount: BigInt(50_000),
});
// result.value === void (Ok(()))
```

---

### `pause`

Halt all mutating operations (`deposit`, `withdraw`, `harvest`). Admin only.

**Signature**

```rust
pub fn pause(env: Env) -> Result<(), VaultError>
```

**Errors**: `NotInitialized` if not yet initialized.

**Events emitted**: `topic: ("paused",), data: ()`

**Example (JavaScript SDK)**

```ts
await contract.call("pause", {});
```

---

### `unpause`

Resume operations after a pause. Admin only.

**Signature**

```rust
pub fn unpause(env: Env) -> Result<(), VaultError>
```

**Errors**: `NotInitialized`.

**Events emitted**: `topic: ("unpaused",), data: ()`

**Example (JavaScript SDK)**

```ts
await contract.call("unpause", {});
```

---

### `is_paused`

Read-only: returns `true` if the vault is currently paused.

**Signature**

```rust
pub fn is_paused(env: Env) -> bool
```

No authorization required. No state changes. No ledger writes.

**Example (JavaScript SDK)**

```ts
const result = await contract.call("is_paused", {});
const paused: boolean = result.value;
```

---

### `total_assets`

Read-only: returns the total underlying tokens currently tracked in the vault.

**Signature**

```rust
pub fn total_assets(env: Env) -> i128
```

No authorization required. No ledger writes.

**Example (JavaScript SDK)**

```ts
const result = await contract.call("total_assets", {});
const total: bigint = result.value; // i128 as BigInt
```

---

### `balance_of`

Read-only: returns the vault share balance for any address.

**Signature**

```rust
pub fn balance_of(env: Env, address: Address) -> i128
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `address` | `Address` | Account to query. Returns `0` for unknown addresses. |

No authorization required. No ledger writes.

**Example (Stellar CLI)**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- balance_of \
  --address GUSER...
```

**Example (JavaScript SDK)**

```ts
const result = await contract.call("balance_of", {
  address: userKeypair.publicKey(),
});
const shares: bigint = result.value; // i128 as BigInt, 0n for unknown addresses
```

---

### `transfer_admin`

Transfer the admin role to a new address. Only the current admin may call this.

**Signature**

```rust
pub fn transfer_admin(
    env: Env,
    new_admin: Address,
) -> Result<(), VaultError>
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `new_admin` | `Address` | The address that will become the new admin. |

**Errors**: `NotInitialized`.

**Events emitted**

```
topic: ("admin_transferred",)
data:  (old_admin: Address, new_admin: Address)
```

**Example (JavaScript SDK)**

```ts
await contract.call("transfer_admin", {
  new_admin: newAdminKeypair.publicKey(),
});
```

---

### `upgrade`

UUPS-style Wasm upgrade. Replaces the contract's executing bytecode atomically.
Only the admin may call this.

**Signature**

```rust
pub fn upgrade(
    env: Env,
    new_wasm_hash: BytesN<32>,
) -> Result<(), VaultError>
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `new_wasm_hash` | `BytesN<32>` | Hash of the new Wasm binary, obtained from `stellar contract upload`. |

**Errors**

| Error | Condition |
|---|---|
| `NotInitialized` | Vault not initialized. |
| `UpgradeUnauthorized` | Caller is not the admin. |
| `StorageLayoutMismatch` | On-chain layout version differs from `CURRENT_LAYOUT_VERSION`. |
| `MathOverflow` | Version counter overflow (extremely unlikely). |

**Events emitted** (before Wasm swap)

```
topic: ("upgrade",)
data:  (admin: Address, new_version: u32, new_wasm_hash: BytesN<32>)
```

**Example (JavaScript SDK)**

```ts
import { xdr, hash } from "@stellar/stellar-sdk";

// new_wasm_hash is the 32-byte hash returned by `stellar contract upload`
const newWasmHash = Buffer.from("<64-hex-chars>", "hex");
await contract.call("upgrade", {
  new_wasm_hash: newWasmHash,
});
```

---

### `version`

Read-only: returns the monotonic upgrade version number (starts at `1` after
`initialize`, increments with each successful `upgrade`).

**Signature**

```rust
pub fn version(env: Env) -> u32
```

---

### `set_fees`

Set performance and management fee rates. Admin only.

**Signature**

```rust
pub fn set_fees(
    env: Env,
    perf_fee_bps: u32,
    mgmt_fee_bps: u32,
) -> Result<(), VaultError>
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `perf_fee_bps` | `u32` | Performance fee in basis points (1 bps = 0.01%). |
| `mgmt_fee_bps` | `u32` | Management fee in basis points. |

**Errors**: `NotInitialized`; invalid values rejected by `fee::validate_fees`.

**Example (JavaScript SDK)**

```ts
// 200 bps = 2% performance fee, 50 bps = 0.5% management fee
await contract.call("set_fees", {
  perf_fee_bps: 200,
  mgmt_fee_bps: 50,
});
```

---

### `set_treasury`

Set the treasury address that receives collected fees. Admin only.

**Signature**

```rust
pub fn set_treasury(env: Env, treasury: Address) -> Result<(), VaultError>
```

**Example (JavaScript SDK)**

```ts
await contract.call("set_treasury", {
  treasury: treasuryKeypair.publicKey(),
});
```

---

### `get_fees`

Read-only: returns `(perf_fee_bps: u32, mgmt_fee_bps: u32)`.

**Signature**

```rust
pub fn get_fees(env: Env) -> (u32, u32)
```

**Example (JavaScript SDK)**

```ts
const result = await contract.call("get_fees", {});
const [perfFeeBps, mgmtFeeBps]: [number, number] = result.value;
// e.g. [200, 50]
```

---

### `total_fees_collected`

Read-only: returns total fees accrued but not yet withdrawn to the treasury.

**Signature**

```rust
pub fn total_fees_collected(env: Env) -> i128
```

**Example (JavaScript SDK)**

```ts
const result = await contract.call("total_fees_collected", {});
const fees: bigint = result.value; // i128 as BigInt
```

---

### `withdraw_fees`

Transfer all accrued fees to the treasury address. Admin only.

**Signature**

```rust
pub fn withdraw_fees(env: Env) -> Result<i128, VaultError>
```

**Returns** `Ok(fees_transferred: i128)`.

**Errors**: `NotInitialized`, `InvalidAddress` (no treasury set).

**Example (JavaScript SDK)**

```ts
const result = await contract.call("withdraw_fees", {});
const transferred: bigint = result.value; // tokens sent to treasury
```

---

## Error Codes

| Code | Variant | Trigger |
|---|---|---|
| 1 | `NotInitialized` | Vault not yet initialized. |
| 2 | `AlreadyInitialized` | `initialize` called more than once. |
| 3 | `InsufficientShares` | Withdraw amount exceeds caller's share balance. |
| 4 | `InsufficientUnderlying` | Vault cannot cover the redemption. |
| 5 | `ZeroAmount` | Zero/negative input, or share mint rounds to zero. |
| 6 | `MathOverflow` | Arithmetic overflow in share formula. |
| 7 | `InvalidAddress` | Reserved / treasury not set. |
| 8 | `ZeroShares` | `harvest` called when `total_shares == 0`. |
| 9 | `UpgradeUnauthorized` | Caller is not the admin for `upgrade`. |
| 10 | `StorageLayoutMismatch` | Layout version mismatch on upgrade. |
| 11 | `VaultPaused` | Mutating operation called while vault is paused. |
| 12 | `BalanceMismatch` | Actual token balance ≠ tracked state (flash-loan guard). |

Soroban surfaces these as `Error(Contract, #N)` in simulation results and
transaction meta. The frontend `translateError` utility in `ui/src/lib/errors.ts`
maps every code to a user-friendly message.

---

## Events

All events are emitted via `env.events().publish(topic, data)`.

| Topic symbol | Emitter | Data fields |
|---|---|---|
| `deposit` | `deposit` | `caller, amount, shares, total_shares, total_deposited` |
| `withdraw` | `withdraw` | `caller, shares, redeemed, total_shares, total_deposited` |
| `harvest` | `harvest` | `caller, yield_amount` |
| `paused` | `pause` | _(none)_ |
| `unpaused` | `unpause` | _(none)_ |
| `admin_transferred` | `transfer_admin` | `old_admin, new_admin` |
| `upgrade` | `upgrade` | `admin, new_version, new_wasm_hash` |
| `suspicious` | `deposit` / `withdraw` / `harvest` | `"balance_mismatch", observed: i128, tracked: i128` |

Index events via the Stellar Horizon `/transactions/{id}/effects` endpoint or
a Soroban event streaming subscription.

---

## Security Model

| Property | Implementation |
|---|---|
| Checks-Effects-Interactions (CEI) | All state writes happen before token transfers. |
| Flash-loan guard | `balance_before == total_deposited` checked at start of every mutating fn; mismatch emits `suspicious` event and returns `BalanceMismatch`. |
| Inflation attack prevention | Zero-share mint rejected with `ZeroAmount`. |
| Overflow safety | All arithmetic uses `checked_mul` / `checked_div` / `checked_add` / `checked_sub`; `overflow-checks = true` in release profile. |
| No `unwrap()` outside tests | All fallible paths return typed `VaultError`. |
| Soroban archival safety | `bump_instance` called on every mutating fn (30-day lifetime, 7-day threshold). |
| Emergency stop | Admin can `pause()` to halt `deposit`, `withdraw`, `harvest`. |
| Harvest access control | Only the admin may call `harvest` (prevents grief/inflation by arbitrary callers). |
| Upgrade guard | Layout version checked before Wasm swap; event emitted before swap so it is always recorded. |

---

## Gas / Resource Notes

Soroban charges fees in **stroops** (1 XLM = 10,000,000 stroops) based on CPU
instructions, memory, ledger reads/writes, and network bandwidth consumed per
transaction.  The table below gives approximate ranges observed on Testnet; mainnet
fees scale with ledger state and network congestion.

### Approximate Fee Table

| Function | Ledger entries read | Ledger entries written | Typical fee (stroops) | Notes |
|---|---|---|---|---|
| `initialize` | 0 | 3 (admin, token, version) | ~500,000 | One-time cost |
| `deposit` | 3 | 4 (balance, total_shares, total_deposited, TTL) | ~800,000–1,200,000 | Scales slightly with share arithmetic |
| `withdraw` | 4 | 4 | ~900,000–1,300,000 | Similar to deposit |
| `harvest` | 3 | 2 (total_deposited, TTL) | ~700,000–1,000,000 | No balance key write for caller |
| `pause` / `unpause` | 1 | 1 | ~300,000 | Minimal state change |
| `is_paused` | 1 | 0 | ~50,000 | Simulation only — no ledger write |
| `total_assets` | 1 | 0 | ~50,000 | Simulation only |
| `balance_of` | 1 | 0 | ~50,000 | Simulation only |
| `transfer_admin` | 1 | 1 | ~300,000 | — |
| `upgrade` | 2 | 2 + Wasm upload | ~2,000,000–5,000,000 | Plan during low-traffic windows |
| `version` | 1 | 0 | ~50,000 | Simulation only |
| `set_fees` | 1 | 1 | ~300,000 | — |
| `set_treasury` | 1 | 1 | ~300,000 | — |
| `get_fees` | 1 | 0 | ~50,000 | Simulation only |
| `total_fees_collected` | 1 | 0 | ~50,000 | Simulation only |
| `withdraw_fees` | 3 | 2 | ~700,000 | Includes token transfer |

> **How to get exact fees:** Use `stellar contract simulate` before submitting any
> transaction.  The simulator returns the exact resource cost breakdown.

```bash
stellar contract simulate \
  --id <CONTRACT_ID> \
  --source <KEYPAIR> \
  --network testnet \
  -- deposit \
  --caller GUSER... \
  --amount 1000000
# Output includes: cpu_insns, mem_bytes, ledger_reads, ledger_writes, min_resource_fee
```

### TTL / Archival Costs

Every mutating function calls `bump_instance` (30-day lifetime, 7-day threshold)
and `bump_persistent` on the caller's balance key.  If an entry has already been
bumped within the threshold window Soroban skips the write, so the actual ledger
write count may be lower than the table shows under normal usage.

Under high-frequency load (many deposits/withdrawals per ledger) the two bump
operations per call become the dominant cost driver.  If you are building an
automated keeper or batching tool, consider tracking the last-bumped ledger and
skipping voluntary bumps when the entry is already near its maximum TTL.

---

## Soroban Natspec Note

Soroban is a Rust (`no_std`) environment — there is no Solidity or EVM ABI.
This document **is** the canonical API reference for `AuraVault`.

The Rust source uses standard `///` doc-comments on every public function and
type.  To view them locally:

```bash
cd aura-vault
cargo doc --open
```

This generates an HTML reference in `target/doc/aura_vault/`.  The content
mirrors the signatures and parameter tables in this document, but the HTML view
includes cross-links to internal types and trait implementations.

> **For Solidity/EVM developers:** think of Soroban `#[contractimpl]` as the
> equivalent of a Solidity contract's public ABI, and `VaultError` variants as
> the equivalent of `revert` reasons.  There is no ABI JSON file — the interface
> is defined by `aura-vault/src/interface.rs` (`AuraVaultTrait`).
