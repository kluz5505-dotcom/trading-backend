import type { Database } from "@/integrations/supabase/types";

export type MarketOperationalStatus = "live" | "hidden" | "restricted" | "paused" | "maintenance" | "delisted";

export type MarketDashboardItem = Database["public"]["Tables"]["markets"]["Row"] & {
  market_status: MarketOperationalStatus;
  recent_transaction_count_24h: number;
  recent_market_event_count_24h: number;
  override_price: number | null;
  override_reason: string | null;
  override_expires_at: string | null;
}

export interface MarketOverviewSnapshot {
  markets: MarketDashboardItem[];
  total_markets: number;
  live_markets: number;
  hidden_markets: number;
  restricted_markets: number;
  paused_markets: number;
  maintenance_markets: number;
  delisted_markets: number;
  total_profiles: number;
  active_profiles: number;
  suspended_profiles: number;
  recent_transactions_24h: number;
  recent_market_events_24h: number;
}

export interface MarketProfileStats {
  total_profiles: number;
  active_profiles: number;
  frozen_profiles: number;
  banned_profiles: number;
  recent_signups_24h: number;
}

export interface MarketDetailRecord {
  market: Database["public"]["Tables"]["markets"]["Row"];
  override: Database["public"]["Tables"]["market_price_overrides"]["Row"] | null;
  market_events: Database["public"]["Tables"]["market_events"]["Row"][];
  recent_transactions: Database["public"]["Tables"]["transactions"]["Row"][];
  profile_stats: MarketProfileStats;
  audit_entries: Database["public"]["Tables"]["audit_logs"]["Row"][];
}
