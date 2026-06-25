# Getting Started with Aura Vault

Aura Vault is a yield-generating vault on the Stellar network. You deposit tokens, receive vault shares, and your shares automatically grow in value as the vault earns yield — no manual compounding required.

---

## Prerequisites

- A Stellar wallet (Freighter recommended)
- Some XLM for transaction fees (~0.1 XLM per transaction)
- The underlying token accepted by the vault (check the vault's token address)

---

## Step 1 — Install a Wallet

**Freighter** is the most widely supported browser wallet for Stellar.

1. Go to [freighter.app](https://www.freighter.app) and install the browser extension.
2. Create a new wallet or import an existing one using your 12/24-word seed phrase.
3. Switch to **Testnet** if you want to try things out risk-free before using real funds.

> Keep your seed phrase offline and never share it with anyone.

---

## Step 2 — Connect Your Wallet

1. Open the Aura Vault app in your browser.
2. Click **Connect Wallet** in the top-right corner.
3. A Freighter popup will appear — click **Connect**.
4. Your wallet address (starts with `G...`) will appear in the header.

If the button shows "Wrong Network", open Freighter and switch to the correct network (Testnet or Mainnet).

---

## Step 3 — Make Your First Deposit

1. Enter the amount of tokens you want to deposit in the **Deposit** field.
2. Click **Deposit**.
3. Freighter will show a transaction preview — review it and click **Approve**.
4. Wait for the transaction to confirm (usually 5–10 seconds on Stellar).
5. Your **share balance** will appear below the form once confirmed.

### How shares work

| Scenario | What you get |
|---|---|
| First ever deposit into the vault | Shares equal to your deposit amount (1:1) |
| Deposit after yield has accrued | Fewer shares than your deposit amount — but each share is worth more |

Your share balance multiplied by the current exchange rate equals your redeemable tokens. As the vault earns yield, the exchange rate increases, so your shares are worth more over time.

---

## Step 4 — Withdraw

1. Enter the number of **shares** you want to redeem in the **Withdraw** field.
2. Click **Withdraw**.
3. Approve the transaction in Freighter.
4. Your underlying tokens (including any accrued yield) will arrive in your wallet.

The amount you receive is calculated as:

```
tokens = floor(shares × total_vault_assets / total_vault_shares)
```

Due to integer rounding, you may receive 1 token less than the theoretical maximum. This is expected behavior — the dust stays in the vault and benefits all remaining shareholders.

---

## Understanding Vault Shares

Think of vault shares like ownership units in a fund:

- The vault holds a pool of tokens.
- You own a percentage of that pool, represented by your shares.
- When the vault earns yield (via `harvest`), the pool grows — but the share count stays the same. So each share is worth more.
- Depositing adds to the pool and mints you new shares. Withdrawing burns your shares and returns your proportion of the pool.

**Example**

| Event | Pool (tokens) | Total shares | Share price |
|---|---|---|---|
| Initial state | 0 | 0 | — |
| Alice deposits 1 000 | 1 000 | 1 000 | 1.00 |
| Yield harvest: +200 | 1 200 | 1 000 | 1.20 |
| Bob deposits 600 | 1 800 | 1 500 | 1.20 |
| Alice withdraws 500 shares | 1 200 | 1 000 | 1.20 |

Alice's 500 shares redeem for `500 × 1200/1000 = 600 tokens` — 100 tokens of yield earned.

---

## Fee Structure

| Fee type | Rate | When applied |
|---|---|---|
| Performance fee | Set by admin (basis points) | Applied to yield at harvest time |
| Management fee | Set by admin (basis points) | Applied periodically |

Fees are collected into the vault treasury and do not affect the share/token ratio for depositors directly — they are deducted from the yield before it is credited to the vault. To check the current fee rates, call `get_fees()` on the contract or view them in the app's settings page.

> 1 basis point = 0.01%. A 200 bps performance fee means 2% of yield goes to the treasury.

---

## FAQ

**Q: Is there a minimum deposit?**  
A: Any amount > 0 is accepted, but very small deposits may round to 0 shares and be rejected. Practically, deposits above 10 tokens work reliably.

**Q: Can I lose my deposit?**  
A: The vault is non-custodial — only you can withdraw your shares. The primary risks are smart contract bugs and the underlying token losing value. The contract has been audited and includes multiple security guards (see [AUDIT.md](../AUDIT.md)).

**Q: What happens if the vault is paused?**  
A: The admin can pause the vault in an emergency. While paused, deposits, withdrawals, and harvests are blocked. Your funds remain safe in the contract — pause does not affect ownership.

**Q: Why did I receive fewer tokens than I deposited?**  
A: If you deposited after yield had already accrued, your shares represent a proportional slice of the bigger pool, so fewer shares were minted. When you withdraw those shares at the current (higher) exchange rate you receive the correct value including yield.

**Q: How do I report an issue?**  
A: Open an issue on the [GitHub repository](https://github.com/soterika/aura-vault-protocol) or contact the team via the community channels listed in the README.

**Q: Is there a video walkthrough?**  
A: A video walkthrough is in production. Check the repository README for the latest link.
