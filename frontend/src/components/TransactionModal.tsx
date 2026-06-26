"use client";

import { useState, useEffect, useRef } from "react";

type TxType = "deposit" | "withdraw";
type Step = 1 | 2 | 3;
type TxStatus = "idle" | "pending" | "success" | "error";

interface Props {
  type: TxType;
  balance: string;
  onClose: () => void;
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-current" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default function TransactionModal({ type, balance, onClose }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState("");
  const [status, setStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState("");
  const [txError, setTxError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 1) inputRef.current?.focus();
  }, [step]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function validateAmount(): boolean {
    const n = parseFloat(amount);
    if (!amount || isNaN(n) || n <= 0) {
      setAmountError("Enter an amount greater than 0");
      return false;
    }
    if (n > parseFloat(balance)) {
      setAmountError("Amount exceeds your balance");
      return false;
    }
    setAmountError("");
    return true;
  }

  function handleNext() {
    if (step === 1 && validateAmount()) setStep(2);
    else if (step === 2) { setStep(3); handleSubmit(); }
  }

  async function handleSubmit() {
    setStatus("pending");
    setTxError("");
    try {
      const res = await fetch("/api/vault/transactions/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, amount }),
      });
      const data = res.ok ? await res.json() : null;
      setTxHash(data?.hash ?? "mock-tx-" + Date.now());
      setStatus("success");
    } catch (err: any) {
      setTxError(err?.message ?? "Transaction failed");
      setStatus("error");
    }
  }

  const label = type === "deposit" ? "Deposit" : "Withdraw";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} modal`}
      data-cy="tx-modal"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        {/* Close */}
        <button
          data-cy="modal-close"
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{label}</h2>

        {/* Step indicator */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-200 dark:bg-zinc-700"}`}
            />
          ))}
        </div>

        {/* Step 1: Amount */}
        {step === 1 && (
          <div data-cy="modal-step-1" className="flex flex-col gap-4">
            <p className="text-sm text-zinc-500">
              Available: <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{balance}</span>
            </p>
            <input
              ref={inputRef}
              data-cy="modal-amount-input"
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAmountError(""); }}
              className="rounded-lg border border-zinc-300 px-4 py-2.5 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {amountError && (
              <p data-cy="modal-amount-error" className="text-sm text-red-600 dark:text-red-400" role="alert">
                {amountError}
              </p>
            )}
            <button
              data-cy="modal-next-btn"
              onClick={handleNext}
              className="rounded-lg bg-zinc-900 px-4 py-2.5 font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div data-cy="modal-step-2" className="flex flex-col gap-4">
            <dl className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800">
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">Amount</dt>
                <dd data-cy="modal-review-amount" className="font-mono font-semibold">{amount}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">Est. gas</dt>
                <dd data-cy="modal-gas-estimate" className="font-mono">0.01 XLM</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">Exchange rate</dt>
                <dd className="font-mono">1:1</dd>
              </div>
            </dl>
            <div className="flex gap-3">
              <button
                data-cy="modal-back-btn"
                onClick={() => setStep(1)}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 font-semibold hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
              >
                Back
              </button>
              <button
                data-cy="modal-next-btn"
                onClick={handleNext}
                className="flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black"
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Signing / Result */}
        {step === 3 && (
          <div data-cy="modal-step-3" className="flex flex-col items-center gap-4 py-4 text-center">
            {status === "pending" && (
              <>
                <Spinner />
                <p className="text-sm text-zinc-500">Confirm in wallet…</p>
                <button
                  data-cy="modal-confirm-btn"
                  disabled
                  className="rounded-lg bg-zinc-200 px-4 py-2.5 font-semibold text-zinc-400 dark:bg-zinc-700"
                >
                  Waiting…
                </button>
              </>
            )}

            {status === "success" && (
              <div data-cy="modal-success" className="flex flex-col items-center gap-3">
                <span className="text-4xl">✅</span>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">{label} successful!</p>
                <p className="text-xs text-zinc-500">
                  Tx: <span data-cy="modal-tx-hash" className="font-mono">{txHash}</span>
                </p>
                <button
                  onClick={onClose}
                  className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black"
                >
                  Done
                </button>
              </div>
            )}

            {status === "error" && (
              <div data-cy="modal-error" className="flex flex-col items-center gap-3">
                <span className="text-4xl">❌</span>
                <p className="text-sm text-red-600 dark:text-red-400">{txError || "Transaction failed"}</p>
                <button
                  data-cy="modal-retry-btn"
                  onClick={() => { setStatus("idle"); handleSubmit(); }}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
