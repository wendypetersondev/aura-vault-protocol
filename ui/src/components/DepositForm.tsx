import { useState, useId, useCallback } from "react";
import type { ToastMessage } from "./Toast";
import { Skeleton } from "./Skeleton";
import { ErrorMessage } from "./ErrorMessage";
import { translateError, type UserError } from "../lib/errors";

interface Props {
  onToast: (msg: ToastMessage) => void;
}

export function DepositForm({ onToast }: Props) {
  const id = useId();
  const [amount, setAmount] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [txError, setTxError] = useState<UserError | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = (val: string) => {
    if (!val || isNaN(Number(val)) || Number(val) <= 0) return "Enter a valid amount greater than 0.";
    return "";
  };

  const submit = useCallback(async () => {
    setTxError(null);
    setLoading(true);
    try {
      // Simulate async contract call — replace with actual Soroban invocation
      await new Promise((r) => setTimeout(r, 1200));
      setAmount("");
      onToast({ type: "success", text: `Deposited ${amount} tokens successfully.` });
    } catch (err) {
      setTxError(translateError(err));
    } finally {
      setLoading(false);
    }
  }, [amount, onToast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(amount);
    if (err) { setFieldError(err); return; }
    setFieldError("");
    submit();
  };

  return (
    <section aria-labelledby={`${id}-title`} className="vault-form">
      <h2 id={`${id}-title`} className="form-title">Deposit</h2>
      {loading ? (
        <Skeleton rows={3} />
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor={`${id}-amount`}>Amount</label>
            <input
              id={`${id}-amount`}
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-describedby={fieldError ? `${id}-err` : undefined}
              aria-invalid={!!fieldError}
              placeholder="0.00"
              className="input"
            />
            {fieldError && (
              <p id={`${id}-err`} role="alert" className="field-error">
                {fieldError}
              </p>
            )}
          </div>

          {txError && (
            <ErrorMessage
              error={txError}
              onRetry={submit}
              onDismiss={() => setTxError(null)}
            />
          )}

          <button type="submit" className="btn btn--primary">
            Deposit
          </button>
        </form>
      )}
    </section>
  );
}
