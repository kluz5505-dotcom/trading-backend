import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { liveMarketEngine } from "@/lib/live-market/server/engine";
import type { Database } from "@/integrations/supabase/types";
import type { OrderSide, OrderType } from "../types";

type OrderRecord = Database["public"]["Tables"]["orders"]["Row"];
type MarketRow = Database["public"]["Tables"]["markets"]["Row"];

interface OrderBookState {
  buys: OrderRecord[];
  sells: OrderRecord[];
}

const tradingBookCache = new Map<string, OrderBookState>();

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

export class TradingEngine {
  private getBook(symbol: string): OrderBookState {
    if (!tradingBookCache.has(symbol)) {
      tradingBookCache.set(symbol, { buys: [], sells: [] });
    }
    return tradingBookCache.get(symbol)!;
  }

  async getMarket(symbol: string): Promise<MarketRow> {
    const { data, error } = await supabaseAdmin
      .from("markets")
      .select("*")
      .eq("symbol", symbol)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Market not found: ${symbol}`);
    return data;
  }

  async getProfile(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("User profile not found");
    return data;
  }

  async resolveMarketPrice(symbol: string): Promise<number> {
    const snapshot = await liveMarketEngine.getSnapshot([symbol]);
    const live = snapshot.find((entry) => entry.symbol === symbol);
    if (live && Number(live.price) > 0) return Number(live.price);
    throw new Error(`Market price unavailable for ${symbol}`);
  }

  async rebuildOrderBook(symbol: string): Promise<OrderBookState> {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("symbol", symbol)
      .in("status", ["new", "accepted", "partially_filled"])
      .gt("remaining_quantity", 0)
      .order("placed_at", { ascending: true });
    if (error) throw new Error(error.message);

    const buys = (data ?? []).filter((row) => row.side === "buy").sort((a, b) => Number(b.price ?? 0) - Number(a.price ?? 0));
    const sells = (data ?? []).filter((row) => row.side === "sell").sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
    const book = { buys, sells };
    tradingBookCache.set(symbol, book);
    return book;
  }

  async placeOrder(userId: string, input: {
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number | null;
    stopPrice?: number | null;
    leverage?: number;
    timeInForce?: string;
    reduceOnly?: boolean;
  }) {
    const market = await this.getMarket(input.symbol);
    const profile = await this.getProfile(userId);

    if (profile.status !== "active") throw new Error("Account is not active");
    if (profile.trading_frozen) throw new Error("Trading is frozen for this account");
    if (market.status !== "active") throw new Error(`Market ${input.symbol} is not active`);
    if (market.maintenance_mode) throw new Error(`Market ${input.symbol} is under maintenance`);
    if (input.side === "buy" && !market.buy_enabled) throw new Error("Buy orders disabled for market");
    if (input.side === "sell" && !market.sell_enabled) throw new Error("Sell orders disabled for market");
    if (input.type === "market" && !market.market_order_enabled) throw new Error("Market orders disabled for market");
    if (input.type === "limit" && !market.limit_order_enabled) throw new Error("Limit orders disabled for market");
    if ((input.type === "stop" || input.type === "take_profit" || input.type === "stop_loss") && !market.stop_order_enabled) throw new Error("Stop orders disabled for market");

    const leverage = Number(input.leverage ?? 1);
    if (leverage > Number(market.max_leverage ?? 1)) throw new Error("Leverage exceeds market maximum");

    const price = await this.resolveMarketPrice(input.symbol);
    const marketPrice = Number(price);
    const orderPrice = input.type === "market" ? marketPrice : Number(input.price ?? 0);
    if (input.type !== "market" && !orderPrice) throw new Error("Price is required for non-market orders");

    const requestedQty = Number(input.quantity);
    const maxOrderSize = Number(market.max_order_size ?? 0);
    if (maxOrderSize > 0 && requestedQty > maxOrderSize) throw new Error("Order exceeds maximum size");

    const spreadBps = Number(market.spread_bps ?? 0);
    const slippageMaxBps = Number(market.slippage_max_bps ?? 300);
    if (input.type !== "market") {
      const deviation = Math.abs((orderPrice - marketPrice) / marketPrice) * 10000;
      if (deviation > slippageMaxBps) throw new Error("Order would exceed max slippage");
    }

    const quoteAsset = market.quote_asset;
    const baseAsset = market.base_asset;
    const notional = requestedQty * (orderPrice || marketPrice);
    const reserveAsset = input.side === "buy" ? quoteAsset : baseAsset;
    const reserveAmount = input.side === "buy" ? notional : requestedQty;

    const { data: balanceRow } = await supabaseAdmin
      .rpc("lock_balance_for_order", {
        p_user_id: userId,
        p_asset: reserveAsset,
        p_amount: reserveAmount,
      }) as { data: { available: number; locked: number }[] | null };
    if (!balanceRow || balanceRow.length === 0) throw new Error("Could not reserve balance");

    const orderInsert = {
      user_id: userId,
      market_id: market.id as string,
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      status: input.type === "market" ? "accepted" : "new",
      quantity: requestedQty,
      remaining_quantity: requestedQty,
      price: input.type === "market" ? marketPrice : orderPrice,
      stop_price: input.stopPrice ?? null,
      time_in_force: input.timeInForce ?? "GTC",
      leverage,
      avg_fill_price: 0,
      total_filled_quantity: 0,
      fee_paid: 0,
      locked_notional: reserveAmount,
      reduce_only: Boolean(input.reduceOnly),
      rejected_reason: null,
      filled_at: null,
      cancelled_at: null,
      expires_at: null,
    };

    const { data: order, error: placeErr } = await supabaseAdmin
      .from("orders")
      .insert(orderInsert)
      .select("*")
      .single();
    if (placeErr || !order) throw new Error(placeErr?.message ?? "Failed to place order");

    await supabaseAdmin.from("order_events").insert({
      order_id: order.id,
      event_type: "placed",
      details: {
        symbol: input.symbol,
        side: input.side,
        type: input.type,
        quantity: requestedQty,
        price: orderPrice,
      },
    });

    await supabaseAdmin.from("admin_logs").insert({
      actor_id: userId,
      actor_email: profile.email ?? null,
      action: "trading.order_placed",
      target_type: "order",
      target_id: order.id,
      severity: "info",
      details: {
        symbol: input.symbol,
        side: input.side,
        type: input.type,
        quantity: requestedQty,
      },
    });

    if (input.type === "market") {
      await this.matchOrder(order.id);
      const { data: refreshed } = await supabaseAdmin.from("orders").select("*").eq("id", order.id).single();
      return refreshed;
    }

    const { data: bookOrder } = await supabaseAdmin.from("orders").select("*").eq("id", order.id).single();
    await this.rebuildOrderBook(input.symbol);
    return bookOrder;
  }

  async cancelOrder(userId: string, orderId: string) {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", userId)
      .single();
    if (error || !order) throw new Error("Order not found");
    if (["filled", "cancelled", "rejected"].includes(order.status)) throw new Error("Order already finalized");

    const market = await this.getMarket(order.symbol);
    const reserveAsset = order.side === "buy" ? market.quote_asset : market.base_asset;
    const remainingReserve = order.side === "buy"
      ? Number(order.remaining_quantity) * Number(order.price ?? 0)
      : Number(order.remaining_quantity);

    if (remainingReserve > 0) {
      await supabaseAdmin.rpc("release_locked_balance", {
        p_user_id: userId,
        p_asset: reserveAsset,
        p_amount: remainingReserve,
      });
    }

    const { data: cancelled, error: cancelErr } = await supabaseAdmin
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select("*")
      .single();
    if (cancelErr || !cancelled) throw new Error(cancelErr?.message ?? "Failed to cancel order");

    await supabaseAdmin.from("order_events").insert({
      order_id: orderId,
      event_type: "cancelled",
      details: { remaining_quantity: order.remaining_quantity },
    });

    await supabaseAdmin.from("admin_logs").insert({
      actor_id: userId,
      actor_email: null,
      action: "trading.order_cancelled",
      target_type: "order",
      target_id: orderId,
      severity: "warning",
      details: { symbol: order.symbol, remaining_quantity: order.remaining_quantity },
    });

    await this.rebuildOrderBook(order.symbol);
    return cancelled;
  }

  async modifyOrder(userId: string, orderId: string, patch: { quantity?: number; price?: number | null; stopPrice?: number | null }) {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", userId)
      .single();
    if (error || !order) throw new Error("Order not found");
    if (order.status !== "new") throw new Error("Only pending orders can be modified");

    const market = await this.getMarket(order.symbol);
    const newQuantity = patch.quantity ?? Number(order.quantity);
    const newPrice = patch.price ?? Number(order.price ?? 0);
    const newStopPrice = patch.stopPrice ?? Number(order.stop_price ?? 0);

    const currentReserve = order.side === "buy"
      ? Number(order.remaining_quantity) * Number(order.price ?? 0)
      : Number(order.remaining_quantity);
    const updatedReserve = newQuantity * newPrice;
    const reserveDelta = updatedReserve - currentReserve;

    if (reserveDelta > 0) {
      await supabaseAdmin.rpc("lock_balance_for_order", {
        p_user_id: userId,
        p_asset: order.side === "buy" ? market.quote_asset : market.base_asset,
        p_amount: reserveDelta,
      });
    } else if (reserveDelta < 0) {
      await supabaseAdmin.rpc("release_locked_balance", {
        p_user_id: userId,
        p_asset: order.side === "buy" ? market.quote_asset : market.base_asset,
        p_amount: Math.abs(reserveDelta),
      });
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("orders")
      .update({
        quantity: newQuantity,
        remaining_quantity: newQuantity - Number(order.total_filled_quantity),
        price: newPrice,
        stop_price: newStopPrice,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select("*")
      .single();
    if (updErr || !updated) throw new Error(updErr?.message ?? "Failed to modify order");

    await supabaseAdmin.from("order_events").insert({
      order_id: orderId,
      event_type: "modified",
      details: { quantity: newQuantity, price: newPrice, stop_price: newStopPrice },
    });

    await this.rebuildOrderBook(order.symbol);
    return updated;
  }

  async matchOrder(orderId: string) {
    const { data: incomingOrder, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (error || !incomingOrder) throw new Error("Order not found");

    const market = await this.getMarket(incomingOrder.symbol);
    const book = await this.rebuildOrderBook(incomingOrder.symbol);
    const counterSide = incomingOrder.side === "buy" ? book.sells : book.buys;

    let remaining = Number(incomingOrder.remaining_quantity);
    let matched = false;

    for (const restingOrder of counterSide) {
      if (remaining <= 0) break;
      if (incomingOrder.side === "buy" && Number(incomingOrder.price ?? 0) < Number(restingOrder.price ?? 0)) break;
      if (incomingOrder.side === "sell" && Number(incomingOrder.price ?? 0) > Number(restingOrder.price ?? 0)) break;

      const filledQty = Math.min(remaining, Number(restingOrder.remaining_quantity));
      if (filledQty <= 0) continue;

      matched = true;
      const executionPrice = Number(restingOrder.price ?? 0);
      const spreadAdjustment = Number(market.spread_bps ?? 0) / 10000;
      const adjustedPrice = incomingOrder.side === "buy"
        ? executionPrice * (1 + spreadAdjustment)
        : executionPrice * (1 - spreadAdjustment);

      const takerFeeBps = Number(market.taker_fee_bps ?? 20);
      const makerFeeBps = Number(market.maker_fee_bps ?? 10);
      const takerFee = filledQty * adjustedPrice * (takerFeeBps / 10000);
      const makerFee = filledQty * adjustedPrice * (makerFeeBps / 10000);

      const pooled = await this.applyFill({
        incomingOrder,
        restingOrder,
        quantity: filledQty,
        price: adjustedPrice,
        takerFee,
        makerFee,
      });

      remaining -= filledQty;
      await this.persistOrderFill(incomingOrder.id, filledQty, adjustedPrice, takerFee, "taker");
      await this.persistOrderFill(restingOrder.id, filledQty, adjustedPrice, makerFee, "maker");

      if (remaining === 0) {
        await supabaseAdmin.from("orders").update({
          status: "filled",
          remaining_quantity: 0,
          total_filled_quantity: Number(incomingOrder.total_filled_quantity) + filledQty,
          avg_fill_price: adjustedPrice,
          fee_paid: Number(incomingOrder.fee_paid) + takerFee,
          filled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", incomingOrder.id);
      } else {
        await supabaseAdmin.from("orders").update({
          status: "partially_filled",
          remaining_quantity: remaining,
          total_filled_quantity: Number(incomingOrder.total_filled_quantity) + filledQty,
          avg_fill_price: (Number(incomingOrder.avg_fill_price) * Number(incomingOrder.total_filled_quantity) + adjustedPrice * filledQty) / (Number(incomingOrder.total_filled_quantity) + filledQty),
          fee_paid: Number(incomingOrder.fee_paid) + takerFee,
          updated_at: new Date().toISOString(),
        }).eq("id", incomingOrder.id);
      }

      await supabaseAdmin.from("orders").update({
        remaining_quantity: Number(restingOrder.remaining_quantity) - filledQty,
        total_filled_quantity: Number(restingOrder.total_filled_quantity) + filledQty,
        avg_fill_price: (Number(restingOrder.avg_fill_price) * Number(restingOrder.total_filled_quantity) + adjustedPrice * filledQty) / (Number(restingOrder.total_filled_quantity) + filledQty),
        fee_paid: Number(restingOrder.fee_paid) + makerFee,
        status: Number(restingOrder.remaining_quantity) - filledQty === 0 ? "filled" : "partially_filled",
        filled_at: Number(restingOrder.remaining_quantity) - filledQty === 0 ? new Date().toISOString() : restingOrder.filled_at,
        updated_at: new Date().toISOString(),
      }).eq("id", restingOrder.id);

      await supabaseAdmin.from("order_events").insert({
        order_id: incomingOrder.id,
        event_type: remaining === 0 ? "filled" : "partially_filled",
        details: { filled_quantity: filledQty, price: adjustedPrice, maker_taker: "taker" },
      });

      await supabaseAdmin.from("order_events").insert({
        order_id: restingOrder.id,
        event_type: Number(restingOrder.remaining_quantity) - filledQty === 0 ? "filled" : "partially_filled",
        details: { filled_quantity: filledQty, price: adjustedPrice, maker_taker: "maker" },
      });
    }

    if (!matched) {
      if (incomingOrder.type === "market") {
        await supabaseAdmin.from("orders").update({
          status: "rejected",
          rejected_reason: "No liquidity available",
          updated_at: new Date().toISOString(),
        }).eq("id", orderId);

        await supabaseAdmin.from("admin_logs").insert({
          actor_id: incomingOrder.user_id,
          actor_email: null,
          action: "trading.order_rejected",
          target_type: "order",
          target_id: orderId,
          severity: "warning",
          details: { symbol: incomingOrder.symbol, reason: "No liquidity available" },
        });
      }
    }

    await this.rebuildOrderBook(incomingOrder.symbol);
    return { matched };
  }

  private async applyFill(params: {
    incomingOrder: OrderRecord;
    restingOrder: OrderRecord;
    quantity: number;
    price: number;
    takerFee: number;
    makerFee: number;
  }) {
    const { incomingOrder, restingOrder, quantity, price, takerFee, makerFee } = params;
    const market = await this.getMarket(incomingOrder.symbol);
    const quoteAsset = market.quote_asset;
    const baseAsset = market.base_asset;
    const buyer = incomingOrder.side === "buy" ? incomingOrder.user_id : restingOrder.user_id;
    const seller = incomingOrder.side === "sell" ? incomingOrder.user_id : restingOrder.user_id;
    const buyerOrder = incomingOrder.side === "buy" ? incomingOrder : restingOrder;
    const sellerOrder = incomingOrder.side === "sell" ? incomingOrder : restingOrder;

    if (incomingOrder.side === "buy") {
      const { data: buyerQuoteRes } = await supabaseAdmin.rpc("adjust_balance_atomic", {
        p_user_id: buyer,
        p_asset: quoteAsset,
        p_available_delta: 0,
        p_locked_delta: -(quantity * price + takerFee),
      }) as { data: { available: number; locked: number }[] | null };
      const buyerQuoteAvailable = Number(buyerQuoteRes?.[0]?.available ?? 0);
      const buyerQuoteLocked = Number(buyerQuoteRes?.[0]?.locked ?? 0);

      const { data: buyerBaseRes } = await supabaseAdmin.rpc("adjust_balance_atomic", {
        p_user_id: buyer,
        p_asset: baseAsset,
        p_available_delta: quantity,
        p_locked_delta: 0,
      }) as { data: { available: number; locked: number }[] | null };
      const buyerBaseAvailable = Number(buyerBaseRes?.[0]?.available ?? 0);
      const buyerBaseLocked = Number(buyerBaseRes?.[0]?.locked ?? 0);

      const { data: sellerBaseRes } = await supabaseAdmin.rpc("adjust_balance_atomic", {
        p_user_id: seller,
        p_asset: baseAsset,
        p_available_delta: 0,
        p_locked_delta: -quantity,
      }) as { data: { available: number; locked: number }[] | null };
      const sellerBaseAvailable = Number(sellerBaseRes?.[0]?.available ?? 0);
      const sellerBaseLocked = Number(sellerBaseRes?.[0]?.locked ?? 0);

      const { data: sellerQuoteRes } = await supabaseAdmin.rpc("adjust_balance_atomic", {
        p_user_id: seller,
        p_asset: quoteAsset,
        p_available_delta: quantity * price - makerFee,
        p_locked_delta: 0,
      }) as { data: { available: number; locked: number }[] | null };
      const sellerQuoteAvailable = Number(sellerQuoteRes?.[0]?.available ?? 0);
      const sellerQuoteLocked = Number(sellerQuoteRes?.[0]?.locked ?? 0);

      await this.recordLedgerEntries({
        buyer,
        seller,
        market,
        quantity,
        price,
        takerFee,
        makerFee,
        buyerOrder,
        sellerOrder,
        buyerQuoteAvailable,
        buyerQuoteLocked,
        buyerBaseAvailable,
        buyerBaseLocked,
        sellerBaseAvailable,
        sellerBaseLocked,
        sellerQuoteAvailable,
        sellerQuoteLocked,
      });
      return;
    }

    const { data: sellerQuoteRes2 } = await supabaseAdmin.rpc("adjust_balance_atomic", {
      p_user_id: seller,
      p_asset: quoteAsset,
      p_available_delta: quantity * price - makerFee,
      p_locked_delta: 0,
    }) as { data: { available: number; locked: number }[] | null };
    const sellerQuoteAvailable = Number(sellerQuoteRes2?.[0]?.available ?? 0);
    const sellerQuoteLocked = Number(sellerQuoteRes2?.[0]?.locked ?? 0);

    const { data: sellerBaseRes2 } = await supabaseAdmin.rpc("adjust_balance_atomic", {
      p_user_id: seller,
      p_asset: baseAsset,
      p_available_delta: 0,
      p_locked_delta: -quantity,
    }) as { data: { available: number; locked: number }[] | null };
    const sellerBaseAvailable = Number(sellerBaseRes2?.[0]?.available ?? 0);
    const sellerBaseLocked = Number(sellerBaseRes2?.[0]?.locked ?? 0);

    const { data: buyerQuoteRes2 } = await supabaseAdmin.rpc("adjust_balance_atomic", {
      p_user_id: buyer,
      p_asset: quoteAsset,
      p_available_delta: 0,
      p_locked_delta: -(quantity * price + takerFee),
    }) as { data: { available: number; locked: number }[] | null };
    const buyerQuoteAvailable = Number(buyerQuoteRes2?.[0]?.available ?? 0);
    const buyerQuoteLocked = Number(buyerQuoteRes2?.[0]?.locked ?? 0);

    const { data: buyerBaseRes2 } = await supabaseAdmin.rpc("adjust_balance_atomic", {
      p_user_id: buyer,
      p_asset: baseAsset,
      p_available_delta: quantity,
      p_locked_delta: 0,
    }) as { data: { available: number; locked: number }[] | null };
    const buyerBaseAvailable = Number(buyerBaseRes2?.[0]?.available ?? 0);
    const buyerBaseLocked = Number(buyerBaseRes2?.[0]?.locked ?? 0);

    await this.recordLedgerEntries({
      buyer,
      seller,
      market,
      quantity,
      price,
      takerFee,
      makerFee,
      buyerOrder,
      sellerOrder,
      buyerQuoteAvailable,
      buyerQuoteLocked,
      buyerBaseAvailable,
      buyerBaseLocked,
      sellerBaseAvailable,
      sellerBaseLocked,
      sellerQuoteAvailable,
      sellerQuoteLocked,
    });
  }

  private async recordLedgerEntries(params: {
    buyer: string;
    seller: string;
    market: Record<string, unknown>;
    quantity: number;
    price: number;
    takerFee: number;
    makerFee: number;
    buyerOrder: OrderRecord;
    sellerOrder: OrderRecord;
    buyerQuoteAvailable: number;
    buyerQuoteLocked: number;
    buyerBaseAvailable: number;
    buyerBaseLocked: number;
    sellerBaseAvailable: number;
    sellerBaseLocked: number;
    sellerQuoteAvailable: number;
    sellerQuoteLocked: number;
  }) {
    const { buyer, seller, market, quantity, price, takerFee, makerFee, buyerOrder, sellerOrder } = params;
    const quoteAsset = market.quote_asset as string;
    const baseAsset = market.base_asset as string;
    const notional = quantity * price;

    await supabaseAdmin.from("transactions").insert([
      {
        user_id: buyer,
        asset: quoteAsset,
        type: "trade_buy",
        amount: -(notional + takerFee),
        balance_after: params.buyerQuoteAvailable + params.buyerQuoteLocked,
        reference_id: buyerOrder.id,
        reference_type: "order",
        note: `Trade buy execution for ${buyerOrder.symbol}`,
      },
      {
        user_id: buyer,
        asset: baseAsset,
        type: "trade_buy",
        amount: quantity,
        balance_after: params.buyerBaseAvailable + params.buyerBaseLocked,
        reference_id: buyerOrder.id,
        reference_type: "order",
        note: `Received ${quantity} ${baseAsset}`,
      },
      {
        user_id: seller,
        asset: baseAsset,
        type: "trade_sell",
        amount: -quantity,
        balance_after: params.sellerBaseAvailable + params.sellerBaseLocked,
        reference_id: sellerOrder.id,
        reference_type: "order",
        note: `Sold ${quantity} ${baseAsset}`,
      },
      {
        user_id: seller,
        asset: quoteAsset,
        type: "trade_sell",
        amount: notional - makerFee,
        balance_after: params.sellerQuoteAvailable + params.sellerQuoteLocked,
        reference_id: sellerOrder.id,
        reference_type: "order",
        note: `Received proceeds from ${sellerOrder.symbol}`,
      },
    ]);

    const execution = await supabaseAdmin.from("executions").insert({
      order_id: buyerOrder.id,
      counter_order_id: sellerOrder.id,
      user_id: buyer,
      market_id: market.id as string,
      symbol: buyerOrder.symbol,
      side: buyerOrder.side,
      quantity,
      price,
      maker_taker: "taker",
      fee: takerFee,
      fee_asset: quoteAsset,
      details: { fee_type: "taker" },
    }).select("*").single();

    if (execution.error || !execution.data) throw new Error(execution.error?.message ?? "Failed to create execution record");

    await supabaseAdmin.from("trades").insert({
      execution_id: execution.data.id,
      order_id: buyerOrder.id,
      counter_order_id: sellerOrder.id,
      user_id: buyer,
      market_id: market.id as string,
      symbol: buyerOrder.symbol,
      side: buyerOrder.side,
      quantity,
      price,
      fee: takerFee,
      fee_asset: quoteAsset,
      maker_taker: "taker",
      details: { fee_type: "taker" },
    });

    await supabaseAdmin.from("order_events").insert({
      order_id: buyerOrder.id,
      event_type: "execution",
      details: { execution_id: execution.data.id, quantity, price, maker_taker: "taker" },
    });

    await this.updatePosition(buyer, market as any, quantity, price, buyerOrder.side as OrderSide);
    await this.updatePosition(seller, market as any, -quantity, price, sellerOrder.side as OrderSide);
  }

  private async persistOrderFill(orderId: string, quantity: number, price: number, fee: number, makerTaker: "maker" | "taker") {
    const { data: order, error } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).single();
    if (error || !order) throw new Error("Order not found");

    const newTotalFilled = Number(order.total_filled_quantity) + quantity;
    const newRemaining = Number(order.remaining_quantity) - quantity;
    const nextAvgFill = newTotalFilled === 0 ? 0 : ((Number(order.avg_fill_price) * Number(order.total_filled_quantity)) + (price * quantity)) / newTotalFilled;

    await supabaseAdmin.from("orders").update({
      total_filled_quantity: newTotalFilled,
      remaining_quantity: newRemaining,
      avg_fill_price: nextAvgFill,
      fee_paid: Number(order.fee_paid) + fee,
      updated_at: new Date().toISOString(),
      status: newRemaining === 0 ? "filled" : "partially_filled",
      filled_at: newRemaining === 0 ? new Date().toISOString() : null,
    }).eq("id", orderId);

    if (newRemaining === 0) {
      await supabaseAdmin.from("order_events").insert({
        order_id: orderId,
        event_type: "filled",
        details: { filled_quantity: newTotalFilled, avg_fill_price: nextAvgFill, maker_taker: makerTaker },
      });
    } else {
      await supabaseAdmin.from("order_events").insert({
        order_id: orderId,
        event_type: "partially_filled",
        details: { filled_quantity: newTotalFilled, remaining_quantity: newRemaining, avg_fill_price: nextAvgFill, maker_taker: makerTaker },
      });
    }
  }

  private async updatePosition(userId: string, market: MarketRow, fillQuantity: number, fillPrice: number, side: OrderSide) {
    const symbol = market.symbol as string;
    const { data: existingPosition, error: posErr } = await supabaseAdmin
      .from("positions")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .maybeSingle();

    if (posErr) throw new Error(posErr.message);

    const currentPrice = await this.resolveMarketPrice(symbol);
    const positionQty = Number(existingPosition?.quantity ?? 0) + fillQuantity;

    if (!existingPosition) {
      const newPosition = await supabaseAdmin.from("positions").insert({
        user_id: userId,
        market_id: market.id as string,
        symbol,
        side: "long",
        quantity: Math.max(positionQty, 0),
        average_entry_price: fillQuantity > 0 ? fillPrice : 0,
        current_price: currentPrice,
        realized_pnl: 0,
        unrealized_pnl: positionQty > 0 ? (currentPrice - fillPrice) * positionQty : 0,
        status: positionQty > 0 ? "open" : "closed",
        closed_at: positionQty <= 0 ? new Date().toISOString() : null,
      }).select("*").single();

      if (newPosition.error || !newPosition.data) throw new Error(newPosition.error?.message ?? "Failed to create position");
      await supabaseAdmin.from("pnl_history").insert({
        position_id: newPosition.data.id,
        user_id: userId,
        market_id: market.id as string,
        symbol,
        realized_pnl: 0,
        unrealized_pnl: (currentPrice - fillPrice) * positionQty,
        total_pnl: (currentPrice - fillPrice) * positionQty,
        snapshot_price: currentPrice,
        reason: fillQuantity > 0 ? "entry" : "close",
      });
      return;
    }

    const realizedComponent = fillQuantity < 0 ? (fillPrice - Number(existingPosition.average_entry_price)) * Math.abs(fillQuantity) : 0;
    const updatedQty = Math.max(positionQty, 0);
    const updatedAvg = updatedQty === 0 ? 0 : existingPosition.quantity === 0 ? fillPrice : ((Number(existingPosition.quantity) * Number(existingPosition.average_entry_price)) + (fillQuantity > 0 ? fillQuantity * fillPrice : 0)) / Math.max(updatedQty, 1);
    const unrealized = updatedQty > 0 ? (currentPrice - updatedAvg) * updatedQty : 0;
    const realized = Number(existingPosition.realized_pnl ?? 0) + realizedComponent;

    const { data: updatedPosition, error: updatedErr } = await supabaseAdmin
      .from("positions")
      .update({
        quantity: updatedQty,
        average_entry_price: updatedAvg,
        current_price: currentPrice,
        realized_pnl: realized,
        unrealized_pnl: unrealized,
        updated_at: new Date().toISOString(),
        status: updatedQty > 0 ? "open" : "closed",
        closed_at: updatedQty <= 0 ? new Date().toISOString() : null,
      })
      .eq("id", existingPosition.id)
      .select("*")
      .single();

    if (updatedErr || !updatedPosition) throw new Error(updatedErr?.message ?? "Failed to update position");

    await supabaseAdmin.from("pnl_history").insert({
      position_id: updatedPosition.id,
      user_id: userId,
      market_id: market.id as string,
      symbol,
      realized_pnl: realized,
      unrealized_pnl: unrealized,
      total_pnl: realized + unrealized,
      snapshot_price: currentPrice,
      reason: fillQuantity > 0 ? "mark_to_market" : "close",
    });
  }
}

export const tradingEngine = new TradingEngine();
