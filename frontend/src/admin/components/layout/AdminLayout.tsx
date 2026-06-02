import type { ReactNode } from 'react';
import { AdminHeader } from '@/admin/components/navigation/AdminHeader';
import { AdminSidebar } from '@/admin/components/navigation/AdminSidebar';

interface AdminLayoutProps {
  children?: ReactNode;
  activeSection?: string;
  title?: string;
  subtitle?: string;
  role?: string;
}

export function AdminLayout({
  children,
  activeSection = 'dashboard',
  title = 'Exchange Admin Control Center',
  subtitle = 'Backend operations console',
  role = 'admin',
}: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        <AdminSidebar activeSection={activeSection} />

        <div className="flex min-w-0 flex-1 flex-col">
          <AdminHeader title={title} subtitle={subtitle} role={role} />

          <main className="flex-1 space-y-6 overflow-auto px-6 py-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-200/70">
                    Backend control surface
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-white">Exchange backend architecture</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Real admin infrastructure for user governance, approvals, balance operations, market controls, telemetry, and role-based permissions.
                  </p>
                </div>
                <div className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                  Protected backend shell
                </div>
              </div>

            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-200/70">
                    Segment output
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-white">Managed backend operations</h2>
                </div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Route-bound control view</div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/90 p-4 text-sm text-slate-300">
                {children ?? (
                  <div className="space-y-2">
                    <p className="font-medium text-white">Primary admin backend layer is ready.</p>
                    <p>
                      Use this shell to mount exchange-specific backend controllers for user review, approvals, market management, wallet settlement, logs, and permissions.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
