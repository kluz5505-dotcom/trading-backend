import { Link } from '@tanstack/react-router';
import { ADMIN_NAV_ITEMS } from '@/admin/core/admin-nav';

interface AdminSidebarProps {
  activeSection?: string;
}

export function AdminSidebar({ activeSection = 'dashboard' }: AdminSidebarProps) {
  return (
    <aside className="w-72 shrink-0 border-r border-slate-800 bg-slate-950/95">
      <div className="px-5 py-6 border-b border-slate-800">
        <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-200/70">
          Exchange Control Plane
        </div>
        <div className="mt-3 text-lg font-semibold text-white">Admin Backend Core</div>
        <p className="mt-1 text-xs text-slate-400">
          Protected operational infrastructure for treasury, market, user, and compliance actions.
        </p>
      </div>

      <div className="p-4 space-y-2">
        {ADMIN_NAV_ITEMS.map((item) => {
          const isActive = item.key === activeSection;
          const routeKeys = new Set(['dashboard', 'deposits', 'withdrawals']);
          const href = item.key === 'dashboard' ? '/admin' : routeKeys.has(item.key) ? `/admin/${item.key}` : undefined;

          const commonClass = `block rounded-xl border px-3 py-2.5 text-left transition ${
            isActive
              ? 'border-cyan-400/40 bg-cyan-500/10 text-white'
              : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
          }`;

          if (href) {
            return (
              <Link key={item.key} to={href} className={commonClass}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-cyan-300' : 'bg-slate-600'}`} />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">{item.description}</p>
              </Link>
            );
          }

          return (
            <div key={item.key} className={commonClass}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{item.label}</span>
                <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-cyan-300' : 'bg-slate-600'}`} />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">{item.description}</p>
            </div>
          );
        })}
      </div>

      <div className="mx-4 mt-4 rounded-xl border border-slate-800 bg-slate-900/90 p-4">
        <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-slate-500">
          Backend action surface
        </div>
        <div className="mt-3 space-y-2 text-xs text-slate-300">
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">User management</div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">Approval workflows</div>
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">Market operations</div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">Balance controls</div>
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">Audit trails</div>
          <div className="rounded-lg border border-slate-500/20 bg-slate-500/5 px-3 py-2">Permission checks</div>
        </div>
      </div>
    </aside>
  );
}
