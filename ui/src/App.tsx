import { useState } from "react";
import { DepositForm } from "./components/DepositForm";
import { WithdrawForm } from "./components/WithdrawForm";
import { HarvestPanel } from "./components/HarvestPanel";
import { Toast } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useTheme } from "./components/ThemeProvider";
import { IconSun, IconMoon } from "./components/Icons";
import type { ToastMessage } from "./components/Toast";

type Tab = "deposit" | "withdraw" | "harvest";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      style={{ background:"transparent", border:"none", cursor:"pointer", color:"var(--color-text-muted)", display:"flex", alignItems:"center", padding:"var(--sp-1)" }}
    >
      {theme === "dark" ? <IconSun size="md" /> : <IconMoon size="md" />}
    </button>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("deposit");
  const [toast, setToast] = useState<ToastMessage | null>(null);

  return (
    <ErrorBoundary>
      <div className="app">
        <a href="#main" className="skip-link">Skip to main content</a>
        <header className="app-header" role="banner">
          <h1>Aura Vault</h1>
          <ThemeToggle />
        </header>
        <main id="main" className="app-main">
          <nav aria-label="Vault actions">
            <div className="tab-list" role="tablist">
              {(["deposit", "withdraw", "harvest"] as Tab[]).map((t) => (
                <button
                  key={t} role="tab"
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
          <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="tab-panel">
            {tab === "deposit"  && <DepositForm  onToast={setToast} />}
            {tab === "withdraw" && <WithdrawForm onToast={setToast} />}
            {tab === "harvest"  && <HarvestPanel onToast={setToast} />}
          </div>
        </main>
        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      </div>
    </ErrorBoundary>
  );
}
