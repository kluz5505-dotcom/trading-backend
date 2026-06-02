export const ADMIN_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', description: 'Operations overview and exchange health' },
  { key: 'users', label: 'Users', description: 'User management and permissions' },
  { key: 'deposits', label: 'Deposits', description: 'Approval queue and fiat/crypto funding review' },
  { key: 'withdrawals', label: 'Withdrawals', description: 'Payout approvals and treasury controls' },
  { key: 'wallets', label: 'Wallets', description: 'Balance controls and custody monitoring' },
  { key: 'markets', label: 'Markets', description: 'Market controls and instrument management' },
  { key: 'logs', label: 'Logs', description: 'Audit trails and operational events' },
  { key: 'settings', label: 'Settings', description: 'Platform settings and role controls' },
] as const;

export const ADMIN_PLACEHOLDER_MODULES = [
  {
    title: 'User Management',
    summary: 'Identity controls, risk states, and role assignment workflows.',
    accent: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',
  },
  {
    title: 'Approvals',
    summary: 'Operational approval queue for deposits, withdrawals, and compliance review.',
    accent: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  },
  {
    title: 'Market Controls',
    summary: 'Exchange listings, market status, spread controls, and trading safeguards.',
    accent: 'border-violet-500/30 bg-violet-500/10 text-violet-100',
  },
  {
    title: 'Balance Controls',
    summary: 'Wallet balances, settlement checks, treasury adjustments, and custody monitoring.',
    accent: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  },
  {
    title: 'Logs',
    summary: 'Immutable audit feed, operator actions, and incident review.',
    accent: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
  },
  {
    title: 'Permissions',
    summary: 'Access control matrix for super_admin, admin, and delegated operational roles.',
    accent: 'border-slate-400/30 bg-slate-500/10 text-slate-100',
  },
] as const;
