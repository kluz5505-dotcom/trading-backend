export const depositRealtimeTables = [
  "deposits",
  "transactions",
  "balances",
  "profiles",
  "wallet_addresses",
  "audit_logs",
] as const;

export const buildDepositRealtimeChannel = (table: (typeof depositRealtimeTables)[number], depositId: string) => `${table}:${depositId}`;

export const depositRealtimeEvents = {
  depositUpdated: "deposit.updated",
  depositApproved: "deposit.approved",
  depositRejected: "deposit.rejected",
  depositHeld: "deposit.held",
  balanceAdjusted: "balance.adjusted",
  auditRecorded: "audit.recorded",
} as const;
