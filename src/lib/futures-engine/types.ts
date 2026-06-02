export type FuturesMarginMode = 'isolated' | 'cross';
export type FuturesOrderType = 'market' | 'limit' | 'stop_market' | 'stop_limit' | 'take_profit' | 'stop_loss' | 'trailing_stop';
export type FuturesOrderStatus = 'new' | 'accepted' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | 'triggered';
export type FuturesPositionStatus = 'open' | 'closed' | 'liquidating';

export interface FuturesOrderInput {
  marketId: string;
  symbol: string;
  side: 'long' | 'short';
  orderType: FuturesOrderType;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  trailingDistance?: number;
  leverage?: number;
  marginMode?: FuturesMarginMode;
  reduceOnly?: boolean;
  postOnly?: boolean;
  expiresAt?: string;
}

export interface FuturesOrderRecord {
  id: string;
  user_id: string;
  market_id: string;
  symbol: string;
  side: 'long' | 'short';
  order_type: FuturesOrderType;
  status: FuturesOrderStatus;
  quantity: number;
  remaining_quantity: number;
  price: number | null;
  trigger_price: number | null;
  trailing_distance: number | null;
  leverage: number;
  margin_mode: FuturesMarginMode;
  reduce_only: boolean;
  post_only: boolean;
  avg_fill_price: number;
  total_filled_quantity: number;
  fee_paid: number;
  locked_margin: number;
  rejected_reason: string | null;
  placed_at: string;
  updated_at: string;
  filled_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
}

export interface FuturesPositionRecord {
  id: string;
  user_id: string;
  market_id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  average_entry_price: number;
  current_price: number;
  leverage: number;
  margin_mode: FuturesMarginMode;
  initial_margin: number;
  maintenance_margin: number;
  margin_allocated: number;
  unrealized_pnl: number;
  realized_pnl: number;
  funding_pnl: number;
  fee_pnl: number;
  total_pnl: number;
  liquidation_price: number | null;
  margin_ratio: number;
  status: FuturesPositionStatus;
  opened_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface FuturesSnapshot {
  userId: string;
  positions: FuturesPositionRecord[];
  openOrders: FuturesOrderRecord[];
  totalEquity: number;
  totalFloatingPnl: number;
  totalMarginUsed: number;
  liquidations: Array<{ id: string; symbol: string; pnl: number; mark_price: number; status: string }>;
}
