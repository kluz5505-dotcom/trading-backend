export const walletRealtimeTables = [
  "wallet_addresses",
  "balances",
  "transactions",
  "profiles",
  "audit_logs",
  "deposits",
  "withdrawals",
] as const;

export const walletRealtimeChannels = {
  wallets: "wallets",
  wallet_addresses: "wallet_addresses",
  balances: "balances",
  transactions: "transactions",
  profiles: "profiles",
  audit_logs: "audit_logs",
  deposits: "deposits",
  withdrawals: "withdrawals",
} as const;
