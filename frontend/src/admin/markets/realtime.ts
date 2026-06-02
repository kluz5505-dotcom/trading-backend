export const marketRealtimeTables = [
  "markets",
  "market_events",
  "market_price_overrides",
  "profiles",
  "transactions",
  "audit_logs",
] as const;

export const buildMarketRealtimeChannel = (table: (typeof marketRealtimeTables)[number], symbol: string) => `${table}:${symbol}`;

export const marketRealtimeEvents = {
  marketUpdated: "market.updated",
  marketEventRecorded: "market.event.recorded",
  priceOverrideUpdated: "market.override.updated",
  marketAuditRecorded: "market.audit.recorded",
} as const;
