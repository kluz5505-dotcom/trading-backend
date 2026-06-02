import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { resolveAdminAccess } from '@/admin/core/admin-access';

interface AdminAuthState {
  isLoading: boolean;
  isAuthorized: boolean;
}

interface AdminAuthGuardProps {
  children: ReactNode;
  redirectTo?: string;
  deniedPath?: string;
}

export function AdminAuthGuard({
  children,
  redirectTo = '/login',
  deniedPath = '/dashboard',
}: AdminAuthGuardProps) {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AdminAuthState>({
    isLoading: true,
    isAuthorized: false,
  });

  useEffect(() => {
    let isMounted = true;

    const evaluateAccess = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session?.user) {
        if (isMounted) {
          setAuthState({ isLoading: false, isAuthorized: false });
        }
        navigate({ to: redirectTo });
        return;
      }

      const access = await resolveAdminAccess(supabase, session);

      if (!isMounted) return;

      if (!access.authorized) {
        setAuthState({ isLoading: false, isAuthorized: false });
        navigate({ to: deniedPath });
        return;
      }

      setAuthState({ isLoading: false, isAuthorized: true });
    };

    setAuthState({ isLoading: true, isAuthorized: false });
    evaluateAccess();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const access = await resolveAdminAccess(supabase, newSession);

      if (!isMounted) return;

      if (!newSession?.user || !access.authorized) {
        setAuthState({ isLoading: false, isAuthorized: false });
        navigate({ to: deniedPath });
        return;
      }

      setAuthState({ isLoading: false, isAuthorized: true });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [deniedPath, navigate, redirectTo]);

  if (authState.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-4 text-sm">
          Loading admin authorization…
        </div>
      </div>
    );
  }

  if (!authState.isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          Access denied. Admin privileges required.
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
