export * from "./service";
export * from "./types";
export * from "./realtime";

export const usersBackendModule = {
  name: 'users',
  type: 'exchange-admin-backend-module',
  capabilities: [
    'search-users',
    'manage-user-status',
    'manage-user-permissions',
    'adjust-user-balances',
    'assign-user-wallets',
    'audit-user-activity',
    'realtime-user-monitoring',
  ],
};
