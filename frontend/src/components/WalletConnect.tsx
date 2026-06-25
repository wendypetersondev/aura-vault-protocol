"use client";

import { useState, useEffect, useCallback } from "react";

interface WalletState {
  address: string | null;
  network: string | null;
  connected: boolean;
}

const STORAGE_KEY = "aura_last_wallet";

function truncate(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function WalletConnect() {
  const [wallet, setWallet] = useState<WalletState>({ address: null, network: null, connected: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Restore last session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setWallet(JSON.parse(saved));
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const api = (window as any).freighterApi;
      if (!api) {
        setError("Freighter wallet not found. Please install the extension.");
        return;
      }
      const connected = await api.isConnected();
      if (!connected) {
        setError("Freighter is not connected. Please unlock your wallet.");
        return;
      }
      const address = await api.getPublicKey();
      const network = (await api.getNetwork()) as string;
      const state: WalletState = { address, network: network.toUpperCase(), connected: true };
      setWallet(state);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err: any) {
      setError(err?.message ?? "Failed to connect wallet");
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    const empty: WalletState = { address: null, network: null, connected: false };
    setWallet(empty);
    sessionStorage.removeItem(STORAGE_KEY);
    setError(null);
  }, []);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Wallet bar */}
      <div className="flex items-center gap-3">
        {wallet.connected ? (
          <>
            <span
              data-cy="network-badge"
              className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
            >
              {wallet.network}
            </span>
            <span data-cy="wallet-address" className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
              {truncate(wallet.address!)}
            </span>
            <button
              data-cy="disconnect-wallet-btn"
              onClick={disconnect}
              className="ml-auto rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            data-cy="connect-wallet-btn"
            onClick={connect}
            disabled={loading}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
          >
            {loading ? "Connecting…" : "Connect Wallet"}
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {/* Portfolio section — only when connected */}
      {wallet.connected && (
        <PortfolioSection address={wallet.address!} />
      )}
    </div>
  );
}

function PortfolioSection({ address }: { address: string }) {
  const [data, setData] = useState<{ totalAssets: string; shareBalance: string; pricePerShare: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      // Fetch from backend API
      const [assetsRes, balanceRes] = await Promise.all([
        fetch(`/api/vault/total_assets`),
        fetch(`/api/vault/balance_of?address=${encodeURIComponent(address)}`),
      ]);
      const assets = assetsRes.ok ? await assetsRes.json() : { total: "0" };
      const balance = balanceRes.ok ? await balanceRes.json() : { balance: "0" };
      const total = BigInt(assets.total ?? 0);
      const shares = BigInt(balance.balance ?? 0);
      const pps = total > 0n && shares > 0n ? (total * 10000n / shares).toString() : "10000";
      setData({ totalAssets: assets.total ?? "0", shareBalance: balance.balance ?? "0", pricePerShare: pps });
    } catch {
      setData({ totalAssets: "—", shareBalance: "—", pricePerShare: "—" });
    } finally {
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  return (
    <section data-cy="portfolio-section" className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Portfolio</h2>
        <button
          data-cy="refresh-btn"
          onClick={load}
          disabled={refreshing}
          className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-200"
        >
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>
      <dl className="grid grid-cols-3 gap-4 text-center">
        <div>
          <dt className="text-xs text-zinc-500 mb-1">Total Vault Assets</dt>
          <dd data-cy="total-assets" className="font-mono text-sm font-semibold">
            {data?.totalAssets ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 mb-1">Your Shares</dt>
          <dd data-cy="share-balance" className="font-mono text-sm font-semibold">
            {data?.shareBalance ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 mb-1">Price / Share</dt>
          <dd data-cy="price-per-share" className="font-mono text-sm font-semibold">
            {data?.pricePerShare ?? "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
