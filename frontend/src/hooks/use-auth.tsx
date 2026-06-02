import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_ALLOWED_ROLES } from '@/admin/core/admin-access';

export interface AuthContextValue {
  isAuthenticated: boolean;
  isReady: boolean;
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadRole = async (userId: string | undefined) => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    const allowedRoles = Array.from(ADMIN_ALLOWED_ROLES);
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", allowedRoles)
      .maybeSingle();
    setIsAdmin(!!data?.role);
  };

  useEffect(() => {
    // Listener first
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      // Defer to avoid potential recursion
      setTimeout(() => loadRole(newSession?.user?.id), 0);
      // Fire-and-forget login tracking
      if (event === "SIGNED_IN" && newSession?.access_token) {
        setTimeout(() => {
          import("@/lib/session.functions").then(({ recordLogin }) => {
            recordLogin({}).catch(() => {});
          });
        }, 0);
      }
    });

    // Then hydrate
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadRole(data.session?.user?.id).finally(() => setIsReady(true));
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: !!session,
      isReady,
      user: session?.user ?? null,
      session,
      isAdmin,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refreshRole: async () => loadRole(session?.user?.id),
    }),
    [session, isReady, isAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
