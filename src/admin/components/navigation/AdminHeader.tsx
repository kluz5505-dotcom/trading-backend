import { useEffect, useState } from 'react';

interface AdminHeaderProps {
  title?: string;
  subtitle?: string;
  role?: string;
}

export function AdminHeader({
  title = 'Exchange Admin Control Center',
  subtitle = 'Operational backend core for exchange governance, treasury, and compliance',
  role = 'admin',
}: AdminHeaderProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-200/70">
            Protected Admin Surface
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-white">{title}</h1>
          <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
            Operational
          </div>
          <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
            {role}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-right font-mono text-[10px] text-slate-300">
            <div className="text-slate-500">UTC</div>
            <div className="text-sm text-white">{now.toISOString().slice(11, 19)}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
