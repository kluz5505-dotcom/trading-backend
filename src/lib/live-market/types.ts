import type { Json } from "@/integrations/supabase/types";

export type MarketSeverity = "info" | "warning" | "critical";

export interface MarketOrderBookLevel {
  price: number;
  quantity: number;
}

export interface MarketOrderBookSnapshot {
  bids: MarketOrderBookLevel[];
  asks: MarketOrderBookLevel[];
  spread_bps: number;
  depth: number;
  source: string;
  updated_at: string;
}

export interface MarketCandlePoint {
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  start_time: string;
  end_time: string;
}

export interface MarketTradeTick {
  id: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: string;
  source: string;
}

export interface MarketSnapshot {
  symbol: string;
  display_name: string;
  market_type: string;
  category: string;
  price: number;
  previous_price: number;
  change_percent: number;
  volume: number;
  high: number;
  low: number;
  spread_bps: number;
  orderbook: MarketOrderBookSnapshot;
  candles: Record<string, MarketCandlePoint[]>;
  trades: MarketTradeTick[];
  source: string;
  status: "active" | "paused" | "maintenance" | "hidden" | "delisted";
  last_updated: string;
  latency_ms: number;
  update_count: number;
  metadata: Json;
}

export interface RealtimeNotification {
  id: string;
  severity: MarketSeverity;
  title: string;
  description: string;
  created_at: string;
  symbol?: string;
  metadata?: Json;
}

export interface FeedStats {
  active_symbols: number;
  ws_connected: boolean;
  reconnects: number;
  heartbeat_ms: number;
  last_heartbeat: string | null;
  last_update: string | null;
  source_health: Record<string, "healthy" | "degraded" | "offline">;
  active_timeframes: string[];
}
