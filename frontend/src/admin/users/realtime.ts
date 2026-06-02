export const userManagementRealtimeTables = [
  "profiles",
  "wallet_addresses",
  "balances",
  "transactions",
  "login_history",
  "audit_logs",
] as const;

export const buildUserManagementChannel = (table: (typeof userManagementRealtimeTables)[number], userId: string) => `${table}:${userId}`;

export const userManagementPayloadTypes = {
  profile: "profile.update",
  wallet: "wallet.assign",
  balance: "balance.adjust",
  session: "session.login",
  audit: "audit.recorded",
} as const;
