export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "take_profit" | "stop_loss";
export type OrderStatus = "new" | "accepted" | "partially_filled" | "filled" | "cancelled" | "rejected" | "expired";

export interface TradingOrderInput {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number | null;
  stopPrice?: number | null;
  leverage?: number;
  timeInForce?: string;
  reduceOnly?: boolean;
}

export interface TradingExecutionRecord {
  orderId: string;
  counterOrderId?: string | null;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  fee: number;
  feeAsset: string;
  makerTaker: "maker" | "taker";
}

export interface AdminTradingOverview {
  total_open_orders: number;
  total_open_positions: number;
  total_recent_trades: number;
  total_pending_cancellations: number;
  total_fees: number;
}
