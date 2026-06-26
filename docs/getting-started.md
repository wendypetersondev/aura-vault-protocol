# Getting Started — Aura Vault Protocol

Aura is a yield vault on the Stellar network. You deposit tokens, receive vault shares, and your shares automatically appreciate as keepers harvest yield — no manual compounding needed.

---

## What You Need Before Starting

- A Stellar wallet (Freighter, Lobstr, or any SEP-7-compatible wallet)
- The underlying token the vault accepts (e.g. USDC on Stellar)
- A small amount of XLM for transaction fees (~0.01 XLM per operation)

---

## Step 1 — Connect Your Wallet

1. Open your Stellar wallet application.
2. Make sure it is set to the correct network (Testnet for testing, Mainnet for real funds).
3. Confirm you have a non-zero XLM balance for fees.
4. Copy your Stellar address (starts with `G...`).

If you are using the Stellar CLI instead of a UI, set up your keypair:

```bash
stellar keys generate my-wallet --network testnet
stellar keys address my-wallet
```

---

## Step 2 — Get the Contract ID

The vault contract ID is a unique identifier on the Stellar network. It looks like:

```
CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Get it from the project's official announcement, the deployer, or the on-chain explorer at [stellar.expert](https://stellar.expert).

---

## Step 3 — Make Your First Deposit

Depositing transfers your tokens into the vault and mints vault shares to your address.

**What you receive:** `vault_shares = floor(amount × total_shares / total_assets)`

For the very first deposit ever made into the vault, the ratio is 1:1 — you receive shares equal to your deposit amount.

**Via Stellar CLI:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source my-wallet \
  --network testnet \
  -- deposit \
  --caller <YOUR_ADDRESS> \
  --amount 1000000
```

> Amounts are in the token's smallest unit. For a token with 7 decimal places, `1000000` = 0.1 tokens. For USDC with 6 decimals, `1000000` = 1 USDC.

**What happens on-chain:**
1. The vault checks your input is valid (non-zero, vault is initialized).
2. It computes your share allocation.
3. It transfers your tokens from your wallet to the vault.
4. It records your shares in on-chain storage.
5. It returns the number of shares minted to you.

---

## Step 4 — Check Your Share Balance

Your shares are your claim on the vault. Read them at any time — this is free (no fee).

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- balance_of \
  --address <YOUR_ADDRESS>
```

To see the total tokens in the vault:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- total_assets
```

---

## Step 5 — Understanding Vault Shares

Vault shares represent a proportional claim on all tokens in the vault, including yield.

| Scenario | Your shares | Vault total shares | Vault total tokens | Your claim |
|---|---|---|---|---|
| After your deposit | 1,000,000 | 1,000,000 | 1,000,000 | 100% |
| After a second depositor | 1,000,000 | 2,000,000 | 2,000,000 | 50% |
| After yield harvest | 1,000,000 | 2,000,000 | 2,200,000 | 50% = 1,100,000 tokens |

Key points:
- Your share *count* does not change when yield is harvested.
- The *value* of each share increases as yield accumulates.
- New depositors pay the current (appreciated) share price — they do not dilute existing holders.

**Redemption formula:** `tokens_returned = floor(your_shares × total_assets / total_shares)`

---

## Step 6 — Withdraw

Burn your shares to receive the underlying tokens back, including any yield.

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source my-wallet \
  --network testnet \
  -- withdraw \
  --caller <YOUR_ADDRESS> \
  --shares 1000000
```

You can withdraw any portion of your shares — you do not need to withdraw everything at once.

**Rounding note:** Due to integer math, you may receive 1 fewer token unit than the exact formula suggests. This is normal and bounded to at most 1 unit per withdrawal.

---

## Fee Structure

Aura v1 has no protocol fee. The only cost is the Stellar network transaction fee (~0.00001 XLM base, plus Soroban resource fees). Typical costs per operation:

| Operation | Approximate cost |
|---|---|
| `deposit` | ~0.01–0.05 XLM |
| `withdraw` | ~0.01–0.05 XLM |
| `harvest` | ~0.01–0.05 XLM |
| `balance_of` / `total_assets` | ~0.001 XLM |

Actual costs depend on network congestion and Soroban resource pricing at the time of the transaction.

---

## FAQ

**Q: Can I lose my deposit?**
The vault is non-custodial — only your wallet key can authorize withdrawals. Your shares are recorded on-chain and cannot be moved without your authorization. Smart contract bugs are always a risk; review the audited code before depositing significant amounts.

**Q: What if I don't interact with the vault for a long time?**
Your balance entry in Soroban storage has a 30-day TTL that is extended every time you interact. If 30 days pass with no interaction and no one else bumps the entry, it may be archived. You would need to restore it with a dedicated Stellar transaction before withdrawing. Active vaults with regular harvests will keep the instance alive; only your personal balance entry could expire independently.

**Q: Can the admin take my funds?**
No. There are no admin-controlled functions that move user funds in v1. The admin address is stored for potential future governance use but has no privileged runtime access to deposits or withdrawals.

**Q: What is a keeper / harvest?**
Any account can call `harvest(yield_amount)` to inject additional tokens into the vault. This increases the exchange rate for all shareholders without minting new shares. Keepers are economically incentivized through yield-sharing arrangements external to the contract.

**Q: What does "ZeroAmount" error mean?**
Your deposit was so small relative to the vault's total assets that the share formula rounded down to zero shares. The vault rejects such deposits to protect you — your tokens are never transferred. Try a larger deposit amount.

**Q: Is this audited?**
See `SECURITY.md` for the current security posture. Always check the latest audit status before depositing.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `NotInitialized` | Vault not set up yet | Contact the deployer |
| `ZeroAmount` | Deposit too small or zero | Increase deposit amount |
| `InsufficientShares` | Withdrawing more shares than you hold | Check `balance_of` first |
| `MathOverflow` | Arithmetic overflow (extremely large amounts) | Use a smaller amount |
| `ZeroShares` | Harvesting into an empty vault | Wait for a depositor first |
| Transaction fee error | Insufficient XLM | Top up XLM balance |
