export * from "./service";
export * from "./types";
export * from "./realtime";

export const depositsBackendModule = {
  name: 'deposits',
  type: 'exchange-admin-backend-module',
  capabilities: [
    'deposit-dashboard',
    'deposit-detail-view',
    'deposit-approval-controls',
    'deposit-realtime-monitoring',
    'deposit-audit-history',
  ],
};
