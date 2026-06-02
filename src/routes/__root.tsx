import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import type { RouterContext } from "../router";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Page not found.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Stratos Global — Centralized Crypto Exchange" },
      {
        name: "description",
        content:
          "Stratos Global: professional centralized crypto exchange — spot & futures, real-time markets, admin-controlled wallets.",
      },
      { property: "og:title", content: "Stratos Global — Centralized Crypto Exchange" },
      { name: "twitter:title", content: "Stratos Global — Centralized Crypto Exchange" },
      { name: "description", content: "Stratos Exchange Core provides a production-ready backend for a centralized crypto exchange, enabling spot and futures trading." },
      { property: "og:description", content: "Stratos Exchange Core provides a production-ready backend for a centralized crypto exchange, enabling spot and futures trading." },
      { name: "twitter:description", content: "Stratos Exchange Core provides a production-ready backend for a centralized crypto exchange, enabling spot and futures trading." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b5947fb1-8f8a-4532-a1be-4d06b203abdd/id-preview-903ca8db--975747e6-b521-4439-a8bc-896e0749be1c.lovable.app-1779969491912.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b5947fb1-8f8a-4532-a1be-4d06b203abdd/id-preview-903ca8db--975747e6-b521-4439-a8bc-896e0749be1c.lovable.app-1779969491912.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthBridge({ children }: { children: React.ReactNode }) {
  // Push auth into router context + invalidate on auth change
  const auth = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    router.update({
      context: { ...router.options.context, auth },
    });
    router.invalidate();
  }, [auth, router]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      qc.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, qc]);

  return <>{children}</>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthBridge>
          <Outlet />
          <Toaster />
        </AuthBridge>
      </AuthProvider>
    </QueryClientProvider>
  );
}
