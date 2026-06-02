export * from "./service";
export * from "./types";
export * from "./realtime";

export const withdrawalsBackendModule = {
  name: 'withdrawals',
  type: 'exchange-admin-backend-module',
  capabilities: [
    'withdrawal-dashboard',
    'withdrawal-detail-view',
    'withdrawal-approval-controls',
    'withdrawal-risk-monitoring',
    'withdrawal-audit-history',
    'withdrawal-realtime-monitoring',
  ],
};
