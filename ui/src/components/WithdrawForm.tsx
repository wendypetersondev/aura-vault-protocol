import { useState, useId, useCallback } from "react";
import type { ToastMessage } from "./Toast";
import { Skeleton } from "./Skeleton";
import { ErrorMessage } from "./ErrorMessage";
import { translateError, type UserError } from "../lib/errors";

interface Props {
  onToast: (msg: ToastMessage) => void;
}

export function WithdrawForm({ onToast }: Props) {
  const id = useId();
  const [shares, setShares] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [txError, setTxError] = useState<UserError | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = (val: string) => {
    if (!val || isNaN(Number(val)) || Number(val) <= 0) return "Enter a valid share amount greater than 0.";
    return "";
  };

  const submit = useCallback(async () => {
    setTxError(null);
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      setShares("");
      onToast({ type: "success", text: `Withdrew ${shares} shares successfully.` });
    } catch (err) {
      setTxError(translateError(err));
    } finally {
      setLoading(false);
    }
  }, [shares, onToast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(shares);
    if (err) { setFieldError(err); return; }
    setFieldError("");
    submit();
  };

  return (
    <section aria-labelledby={`${id}-title`} className="vault-form">
      <h2 id={`${id}-title`} className="form-title">Withdraw</h2>
      {loading ? (
        <Skeleton rows={3} />
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor={`${id}-shares`}>Shares</label>
            <input
              id={`${id}-shares`}
              type="number"
              min="0"
              step="any"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
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
            Withdraw
          </button>
        </form>
      )}
    </section>
  );
}
