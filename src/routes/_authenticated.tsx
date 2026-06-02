import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (context.auth && context.auth.isReady && !context.auth.isAuthenticated) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, isAdmin, signOut, isReady, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const nav = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/deposit", label: "Deposit" },
    { to: "/withdraw", label: "Withdraw" },
    { to: "/markets", label: "Markets" },
    { to: "/trading", label: "Trading" },
    { to: "/futures", label: "Futures" },
    { to: "/profile", label: "Profile" },
    { to: "/wallets", label: "Wallets" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-6 h-14 border-b border-border">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-semibold tracking-tight">
            Stratos Global
          </Link>
          <nav className="flex items-center gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`px-3 py-1.5 text-sm rounded-md hover:bg-muted ${path === n.to ? "bg-muted font-medium" : "text-muted-foreground"}`}
              >
                {n.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                className={`px-3 py-1.5 text-sm rounded-md hover:bg-muted ${path.startsWith("/admin") ? "bg-muted font-medium" : "text-muted-foreground"}`}
              >
                Admin
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {user?.email}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
