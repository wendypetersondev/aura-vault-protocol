"use client";

import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface Settings {
  slippageTolerance: number;
  notifyDeposits: boolean;
  notifyWithdrawals: boolean;
  notifyVaultEvents: boolean;
  emailNotifications: boolean;
  email: string;
  twoFactorEnabled: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  slippageTolerance: 0.5,
  notifyDeposits: true,
  notifyWithdrawals: true,
  notifyVaultEvents: false,
  emailNotifications: false,
  email: "",
  twoFactorEnabled: false,
};

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem("aura_settings");
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings) {
  localStorage.setItem("aura_settings", JSON.stringify(settings));
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const slippageOptions = [0.1, 0.5, 1.0, 3.0];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 py-8">
      <div className="max-w-2xl mx-auto w-full px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-semibold mb-8">Settings</h1>

        {saved && (
          <div role="status" className="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400">
            Settings saved
          </div>
        )}

        {/* Appearance */}
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Appearance</h2>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
              Choose your preferred color theme.
            </p>
            <ThemeToggle />
          </div>
        </section>

        {/* Wallet Info */}
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Connected Wallet</h2>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
            <p className="text-sm text-zinc-500">No wallet connected</p>
            <button className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors sm:w-auto">
              Connect Wallet
            </button>
          </div>
        </section>

        {/* Slippage */}
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Slippage Tolerance</h2>
          <div className="flex flex-wrap gap-2">
            {slippageOptions.map((val) => (
              <button
                key={val}
                onClick={() => update("slippageTolerance", val)}
                className={`w-full rounded-lg px-4 py-2 text-sm font-medium border transition-colors sm:w-auto ${
                  settings.slippageTolerance === val
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:border-indigo-400"
                }`}
              >
                {val}%
              </button>
            ))}
          </div>
          {settings.slippageTolerance >= 3 && (
            <p className="mt-2 text-xs text-amber-600">High slippage may result in unfavorable trades</p>
          )}
        </section>

        {/* Notifications */}
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Notifications</h2>
          <div className="space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
            {([
              ["notifyDeposits", "Deposit confirmations"] as const,
              ["notifyWithdrawals", "Withdrawal confirmations"] as const,
              ["notifyVaultEvents", "Vault performance alerts"] as const,
              ["emailNotifications", "Email notifications"] as const,
            ]).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-sm">{label}</span>
                <input
                  type="checkbox"
                  checked={settings[key] as boolean}
                  onChange={(e) => update(key, e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            ))}
            {settings.emailNotifications && (
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <label className="text-xs text-zinc-500 block mb-1">Email address</label>
                <input
                  type="email"
                  value={settings.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>
        </section>

        {/* Security */}
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Security</h2>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm font-medium">Two-Factor Authentication</span>
                <p className="text-xs text-zinc-500 mt-0.5">Add an extra layer of security</p>
              </div>
              <input
                type="checkbox"
                checked={settings.twoFactorEnabled}
                onChange={(e) => update("twoFactorEnabled", e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          </div>
        </section>

        {/* Danger Zone */}
        <section>
          <h2 className="text-lg font-medium mb-3 text-red-600">Danger Zone</h2>
          <div className="rounded-xl border border-red-200 dark:border-red-900/30 p-4 bg-red-50 dark:bg-red-950/20">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
              Deactivating your account will remove all data and cannot be undone.
            </p>
            <button
              onClick={() => setShowDeactivate(true)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
            >
              Deactivate Account
            </button>
            {showDeactivate && (
              <div className="mt-3 p-3 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-zinc-900">
                <p className="text-sm text-red-600 font-medium mb-2">Are you sure? This action is irreversible.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeactivate(false)}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700">
                    Confirm Deactivation
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
