export * from "./service";
export { marketRealtimeTables, buildMarketRealtimeChannel, marketRealtimeEvents } from "./realtime";
export type { MarketDashboardItem, MarketOverviewSnapshot, MarketProfileStats, MarketDetailRecord } from "./types";

export const marketsBackendModule = {
  name: "markets",
  type: "exchange-admin-backend-module",
};
