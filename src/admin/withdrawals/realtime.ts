export const withdrawalRealtimeTables = [
  "withdrawals",
  "transactions",
  "balances",
  "profiles",
  "wallet_addresses",
  "login_history",
  "audit_logs",
] as const;

export const buildWithdrawalRealtimeChannel = (table: (typeof withdrawalRealtimeTables)[number], withdrawalId: string) => `${table}:${withdrawalId}`;

export const withdrawalRealtimeEvents = {
  withdrawalUpdated: "withdrawal.updated",
  withdrawalApproved: "withdrawal.approved",
  withdrawalRejected: "withdrawal.rejected",
  withdrawalHeld: "withdrawal.held",
  balanceAdjusted: "balance.adjusted",
  auditRecorded: "audit.recorded",
} as const;
