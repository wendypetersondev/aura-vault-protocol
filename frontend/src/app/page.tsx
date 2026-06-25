import WalletConnect from "@/components/WalletConnect";
import VaultActions from "@/components/VaultActions";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-start gap-8 p-8 max-w-2xl mx-auto">
      <header className="w-full">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Aura Vault
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Share-based yield vault on Stellar / Soroban
        </p>
      </header>
      <section className="w-full">
        <WalletConnect />
      </section>
      <section className="w-full">
        <VaultActions />
      </section>
    </main>
  );
}
