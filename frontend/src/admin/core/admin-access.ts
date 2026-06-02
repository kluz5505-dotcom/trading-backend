import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type AdminRole = 'super_admin' | 'admin';

export const ADMIN_ALLOWED_ROLES = new Set<AdminRole>(['super_admin', 'admin']);

export interface AdminAccessResult {
  session: Session | null;
  user: User | null;
  role: AdminRole | null;
  authorized: boolean;
}

export async function resolveAdminAccess(
  supabaseClient: SupabaseClient<Database>,
  session: Session | null,
): Promise<AdminAccessResult> {
  const user = session?.user ?? null;

  if (!user) {
    return {
      session,
      user: null,
      role: null,
      authorized: false,
    };
  }

  const allowedRoles = Array.from(ADMIN_ALLOWED_ROLES);

  const { data, error } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', allowedRoles)
    .maybeSingle();

  const role = data?.role ?? null;

  return {
    session,
    user,
    role: role as AdminRole | null,
    authorized: Boolean(role && ADMIN_ALLOWED_ROLES.has(role as AdminRole) && !error),
  };
}
