import { useState } from "react";
import { DepositForm } from "./components/DepositForm";
import { WithdrawForm } from "./components/WithdrawForm";
import { HarvestPanel } from "./components/HarvestPanel";
import { Toast } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OnboardingFlow, hasCompletedOnboarding } from "./components/OnboardingFlow";
import type { ToastMessage } from "./components/Toast";

type Tab = "deposit" | "withdraw" | "harvest";

export default function App() {
  const [tab, setTab] = useState<Tab>("deposit");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !hasCompletedOnboarding()
  );

  const notify = (msg: ToastMessage) => {
    setToast(msg);
  };

  return (
    <ErrorBoundary>
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="app-header" role="banner">
        <h1>Aura Vault</h1>
      </header>

      <main id="main" className="app-main">
        <nav aria-label="Vault actions">
          <div className="tab-list" role="tablist">
            {(["deposit", "withdraw", "harvest"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                aria-controls={`panel-${t}`}
                id={`tab-${t}`}
                className={`tab-btn${tab === t ? " tab-btn--active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </nav>

        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="tab-panel"
        >
          {tab === "deposit" && <DepositForm onToast={notify} />}
          {tab === "withdraw" && <WithdrawForm onToast={notify} />}
          {tab === "harvest" && <HarvestPanel onToast={notify} />}
        </div>
      </main>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {showOnboarding && (
        <OnboardingFlow onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
    </ErrorBoundary>
  );
}
