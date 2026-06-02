export const walletsBackendModule = {
  name: 'wallets',
  type: 'exchange-admin-backend-module',
  capabilities: [
    'wallet-dashboard',
    'wallet-controls',
    'financial-controls',
    'wallet-information',
    'treasury-controls',
    'realtime-audit',
  ],
  realtimeTables: [
    'wallet_addresses',
    'balances',
    'transactions',
    'profiles',
    'audit_logs',
    'deposits',
    'withdrawals',
  ],
};

export * from './service';
export * from './types';
export * from './realtime';
