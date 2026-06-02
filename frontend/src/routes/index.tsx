import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { isAuthenticated, isAdmin } = useAuth();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-md bg-primary" />
          <span className="font-semibold tracking-tight">Stratos Global</span>
        </div>
        <nav className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <Button asChild variant="ghost">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              {isAdmin && (
                <Button asChild variant="outline">
                  <Link to="/admin">Admin</Link>
                </Button>
              )}
            </>
          ) : (
            <Button asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-24">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Centralized Crypto Exchange
        </p>
        <h1 className="mt-4 text-5xl md:text-6xl font-semibold tracking-tight">
          Spot & futures trading, fully admin-controlled.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Stratos Global is a production-grade exchange backend: live market
          feeds, ledger-based wallets, KYC, admin-reviewed deposits and
          withdrawals, and a complete audit trail.
        </p>
        <div className="mt-10 flex gap-3">
          <Button asChild size="lg">
            <Link to={isAuthenticated ? "/dashboard" : "/login"}>
              {isAuthenticated ? "Go to dashboard" : "Get started"}
            </Link>
          </Button>
        </div>

        <div className="mt-24 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Wallet ledger", "Per-asset available / locked balances, append-only transaction history."],
            ["Admin approvals", "Every deposit & withdrawal reviewed by an admin with audit logs."],
            ["Real markets", "BTC, ETH, SOL, XRP, BNB — spot pairs and leveraged perpetuals."],
            ["KYC pipeline", "Document submission and admin review for tier upgrades."],
            ["Role-based access", "Postgres RLS + server-side role checks on every write."],
            ["API-ready", "All operations exposed as typed server functions."],
          ].map(([title, body]) => (
            <div
              key={title}
              className="rounded-lg border border-border p-5 bg-card"
            >
              <h3 className="font-medium">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
