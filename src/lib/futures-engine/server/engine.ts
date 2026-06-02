import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { liveMarketEngine } from "@/lib/live-market/server/engine";
import type { Database } from "@/integrations/supabase/types";

type FuturesOrderRow = Database["public"]["Tables"]["futures_orders"]["Row"];
type FuturesPositionRow = Database["public"]["Tables"]["futures_positions"]["Row"];
type MarketRow = Database["public"]["Tables"]["markets"]["Row"];
type FuturesOrderRecord = FuturesOrderRow;
type FuturesPositionRecord = FuturesPositionRow;

interface FuturesOrderBookState {
  buys: FuturesOrderRow[];
  sells: FuturesOrderRow[];
}

const futuresBookCache = new Map<string, FuturesOrderBookState>();

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

export class FuturesEngine {
  private getBook(symbol: string): FuturesOrderBookState {
    if (!futuresBookCache.has(symbol)) {
      futuresBookCache.set(symbol, { buys: [], sells: [] });
    }
    return futuresBookCache.get(symbol)!;
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

    const { data, error } = await supabaseAdmin
      .from("markets")
      .select("last_price")
      .eq("symbol", symbol)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const fallback = Number((data as { last_price?: number } | null)?.last_price ?? 0);
    if (fallback > 0) return fallback;
    throw new Error(`Market price unavailable for ${symbol}`);
  }

  async rebuildOrderBook(symbol: string): Promise<FuturesOrderBookState> {
    const { data, error } = await supabaseAdmin
      .from("futures_orders")
      .select("*")
      .eq("symbol", symbol)
      .in("status", ["new", "accepted", "partially_filled", "triggered"])
      .gt("remaining_quantity", 0)
      .order("placed_at", { ascending: true });
    if (error) throw new Error(error.message);

    const buys = (data ?? [])
      .filter((row) => row.side === "long")
      .sort((a, b) => Number(b.price ?? 0) - Number(a.price ?? 0));
    const sells = (data ?? [])
      .filter((row) => row.side === "short")
      .sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));

    const book = { buys, sells };
    futuresBookCache.set(symbol, book);
    return book;
  }

  async placeOrder(
    userId: string,
    input: {
      symbol: string;
      side: "long" | "short";
      orderType: "market" | "limit" | "stop_market" | "stop_limit" | "take_profit" | "stop_loss" | "trailing_stop";
      quantity: number;
      price?: number | null;
      triggerPrice?: number | null;
      trailingDistance?: number | null;
      leverage?: number;
      marginMode?: "isolated" | "cross";
      reduceOnly?: boolean;
      postOnly?: boolean;
    }
  ) {
    const market = await this.getMarket(input.symbol);
    const profile = await this.getProfile(userId);

    if (profile.status !== "active") throw new Error("Account is not active");
    if (profile.trading_frozen) throw new Error("Trading is frozen for this account");
    if (market.status !== "active") throw new Error(`Market ${input.symbol} is not active`);
    if (market.maintenance_mode) throw new Error(`Market ${input.symbol} is under maintenance`);
    if (market.market_type !== "futures") throw new Error("Only futures markets support futures orders");

    const leverage = Number(input.leverage ?? market.max_leverage ?? 1);
    if (leverage > Number(market.max_leverage ?? 1)) throw new Error("Leverage exceeds market maximum");

    const markPrice = await this.resolveMarketPrice(input.symbol);
    const orderPrice = input.orderType === "market" ? markPrice : Number(input.price ?? markPrice);
    if (input.orderType !== "market" && !Number.isFinite(orderPrice)) {
      throw new Error("Price is required for non-market futures orders");
    }

    const quantity = Number(input.quantity);
    const notional = quantity * orderPrice;
    const reserveAmount = notional / leverage;

    if (reserveAmount <= 0) throw new Error("Margin reservation must be positive");

    const lockResult = await supabaseAdmin.rpc("lock_balance_for_order", {
      p_user_id: userId,
      p_asset: market.quote_asset,
      p_amount: reserveAmount,
    }) as { data: { available: number; locked: number }[] | null };
    if (!lockResult.data || lockResult.data.length === 0) {
      throw new Error("Could not reserve collateral for futures order");
    }

    const orderInsert = {
      user_id: userId,
      market_id: market.id,
      symbol: input.symbol,
      side: input.side,
      order_type: input.orderType,
      status: input.orderType === "market" ? "accepted" : "new",
      quantity,
      remaining_quantity: quantity,
      price: input.orderType === "market" ? markPrice : orderPrice,
      trigger_price: input.triggerPrice ?? null,
      trailing_distance: input.trailingDistance ?? null,
      leverage,
      margin_mode: input.marginMode ?? "cross",
      reduce_only: Boolean(input.reduceOnly),
      post_only: Boolean(input.postOnly),
      avg_fill_price: 0,
      total_filled_quantity: 0,
      fee_paid: 0,
      locked_margin: reserveAmount,
      rejected_reason: null,
      placed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      filled_at: null,
      cancelled_at: null,
      expires_at: input.orderType === "market" ? null : null,
    };

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("futures_orders")
      .insert(orderInsert)
      .select("*")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Failed to place futures order");

    await supabaseAdmin.from("risk_events").insert({
      user_id: userId,
      symbol: input.symbol,
      event_type: "futures_order_placed",
      severity: "info",
      details: {
        order_id: order.id,
        side: input.side,
        order_type: input.orderType,
        quantity,
        leverage,
        margin_mode: orderInsert.margin_mode,
      },
    });

    if (input.orderType === "market") {
      await this.matchOrder(order.id);
    } else {
      await this.rebuildOrderBook(input.symbol);
    }

    const { data: refreshed } = await supabaseAdmin.from("futures_orders").select("*").eq("id", order.id).single();
    return refreshed;
  }

  async cancelOrder(userId: string, orderId: string) {
    const { data: order, error } = await supabaseAdmin
      .from("futures_orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", userId)
      .single();
    if (error || !order) throw new Error("Futures order not found");
    if (["filled", "cancelled", "rejected"].includes(order.status)) throw new Error("Order already finalized");

    if (Number(order.locked_margin ?? 0) > 0) {
      const market = await this.getMarket(order.symbol);
      await supabaseAdmin.rpc("release_locked_balance", {
        p_user_id: userId,
        p_asset: market.quote_asset,
        p_amount: Number(order.locked_margin ?? 0),
      });
    }

    const { data: cancelled, error: cancelErr } = await supabaseAdmin
      .from("futures_orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select("*")
      .single();
    if (cancelErr || !cancelled) throw new Error(cancelErr?.message ?? "Failed to cancel futures order");

    await supabaseAdmin.from("risk_events").insert({
      user_id: userId,
      symbol: order.symbol,
      event_type: "futures_order_cancelled",
      severity: "info",
      details: { order_id: orderId, remaining_quantity: order.remaining_quantity },
    });

    return cancelled;
  }

  async modifyOrder(userId: string, orderId: string, patch: { quantity?: number; price?: number | null; triggerPrice?: number | null }) {
    const { data: order, error } = await supabaseAdmin
      .from("futures_orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", userId)
      .single();
    if (error || !order) throw new Error("Futures order not found");
    if (["filled", "cancelled", "rejected"].includes(order.status)) throw new Error("Order already finalized");

    const market = await this.getMarket(order.symbol);
    const newQuantity = patch.quantity ?? Number(order.quantity);
    const newPrice = patch.price ?? Number(order.price ?? 0);
    const newTrigger = patch.triggerPrice ?? Number(order.trigger_price ?? 0);
    const newMargin = (newQuantity * (newPrice || Number(order.price ?? 0))) / Number(order.leverage ?? 1);
    const oldMargin = Number(order.locked_margin ?? 0);

    if (oldMargin > 0) {
      await supabaseAdmin.rpc("release_locked_balance", {
        p_user_id: userId,
        p_asset: market.quote_asset,
        p_amount: oldMargin,
      });
    }

    const reserveAmount = Math.max(newMargin - oldMargin, 0);
    if (reserveAmount > 0) {
      await supabaseAdmin.rpc("lock_balance_for_order", {
        p_user_id: userId,
        p_asset: market.quote_asset,
        p_amount: reserveAmount,
      });
    }

    const { data: modified, error: modifyErr } = await supabaseAdmin
      .from("futures_orders")
      .update({
        quantity: newQuantity,
        remaining_quantity: newQuantity,
        price: newPrice || null,
        trigger_price: newTrigger || null,
        locked_margin: newMargin,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select("*")
      .single();
    if (modifyErr || !modified) throw new Error(modifyErr?.message ?? "Failed to modify futures order");

    await this.rebuildOrderBook(order.symbol);
    return modified;
  }

  async matchOrder(orderId: string) {
    const { data: incomingOrder, error } = await supabaseAdmin
      .from("futures_orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (error || !incomingOrder) throw new Error("Futures order not found");

    const market = await this.getMarket(incomingOrder.symbol);
    const book = await this.rebuildOrderBook(incomingOrder.symbol);
    const currentPrice = await this.resolveMarketPrice(incomingOrder.symbol);
    const counterSide = incomingOrder.side === "long" ? book.sells : book.buys;

    let remaining = Number(incomingOrder.remaining_quantity);
    let matched = false;

    for (const restingOrder of counterSide) {
      if (remaining <= 0) break;

      const restingPrice = Number(restingOrder.price ?? currentPrice);
      const incomingPrice = Number(incomingOrder.price ?? currentPrice);
      if (incomingOrder.side === "long" && incomingOrder.order_type !== "market" && incomingPrice < restingPrice) break;
      if (incomingOrder.side === "short" && incomingOrder.order_type !== "market" && incomingPrice > restingPrice) break;

      const filledQty = Math.min(remaining, Number(restingOrder.remaining_quantity));
      if (filledQty <= 0) continue;

      matched = true;
      const executionPrice = restingPrice;
      const takerFeeBps = Number(market.taker_fee_bps ?? 20);
      const makerFeeBps = Number(market.maker_fee_bps ?? 10);
      const takerFee = filledQty * executionPrice * (takerFeeBps / 10000);
      const makerFee = filledQty * executionPrice * (makerFeeBps / 10000);

      await this.applyFill({
        incomingOrder,
        restingOrder,
        quantity: filledQty,
        price: executionPrice,
        takerFee,
        makerFee,
      });

      remaining -= filledQty;
      const nextIncomingStatus = remaining === 0 ? "filled" : "partially_filled";
      await supabaseAdmin.from("futures_orders").update({
        remaining_quantity: remaining,
        total_filled_quantity: Number(incomingOrder.total_filled_quantity) + filledQty,
        avg_fill_price: ((Number(incomingOrder.avg_fill_price ?? 0) * Number(incomingOrder.total_filled_quantity ?? 0)) + (executionPrice * filledQty)) / Math.max(Number(incomingOrder.total_filled_quantity) + filledQty, 1),
        fee_paid: Number(incomingOrder.fee_paid ?? 0) + takerFee,
        status: nextIncomingStatus,
        filled_at: remaining === 0 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", incomingOrder.id);

      const nextRestingStatus = Number(restingOrder.remaining_quantity) - filledQty === 0 ? "filled" : "partially_filled";
      await supabaseAdmin.from("futures_orders").update({
        remaining_quantity: Number(restingOrder.remaining_quantity) - filledQty,
        total_filled_quantity: Number(restingOrder.total_filled_quantity) + filledQty,
        avg_fill_price: ((Number(restingOrder.avg_fill_price ?? 0) * Number(restingOrder.total_filled_quantity ?? 0)) + (executionPrice * filledQty)) / Math.max(Number(restingOrder.total_filled_quantity) + filledQty, 1),
        fee_paid: Number(restingOrder.fee_paid ?? 0) + makerFee,
        status: nextRestingStatus,
        filled_at: Number(restingOrder.remaining_quantity) - filledQty === 0 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", restingOrder.id);

      await supabaseAdmin.from("risk_events").insert({
        user_id: incomingOrder.user_id,
        symbol: incomingOrder.symbol,
        event_type: "futures_fill",
        severity: "info",
        details: { order_id: incomingOrder.id, filled_quantity: filledQty, price: executionPrice },
      });
    }

    if (!matched && incomingOrder.order_type === "market") {
      const market = await this.getMarket(incomingOrder.symbol);
      if (Number(incomingOrder.locked_margin ?? 0) > 0) {
        await supabaseAdmin.rpc("release_locked_balance", {
          p_user_id: incomingOrder.user_id,
          p_asset: market.quote_asset,
          p_amount: Number(incomingOrder.locked_margin ?? 0),
        });
      }
      await supabaseAdmin.from("futures_orders").update({
        status: "rejected",
        rejected_reason: "No liquidity available",
        updated_at: new Date().toISOString(),
      }).eq("id", orderId);
    }

    await this.rebuildOrderBook(incomingOrder.symbol);
    return { matched };
  }

  private async applyFill(params: {
    incomingOrder: FuturesOrderRecord;
    restingOrder: FuturesOrderRecord;
    quantity: number;
    price: number;
    takerFee: number;
    makerFee: number;
  }) {
    const { incomingOrder, restingOrder, quantity, price, takerFee, makerFee } = params;
    const market = await this.getMarket(incomingOrder.symbol);
    const quoteAsset = market.quote_asset as string;

    const incomingIsTaker = incomingOrder.order_type === "market" || (incomingOrder.order_type !== "market" && Number(restingOrder.price ?? 0) <= Number(incomingOrder.price ?? 0));
    const takerOrder = incomingIsTaker ? incomingOrder : restingOrder;
    const makerOrder = incomingIsTaker ? restingOrder : incomingOrder;

    const takerUserId = takerOrder.user_id;
    const makerUserId = makerOrder.user_id;

    await supabaseAdmin.from("transactions").insert([
      {
        user_id: takerUserId,
        asset: quoteAsset,
        type: "fee",
        amount: -takerFee,
        balance_after: 0,
        reference_id: takerOrder.id,
        reference_type: "futures_order",
        note: `Taker futures fee for ${takerOrder.symbol}`,
      },
      {
        user_id: makerUserId,
        asset: quoteAsset,
        type: "fee",
        amount: -makerFee,
        balance_after: 0,
        reference_id: makerOrder.id,
        reference_type: "futures_order",
        note: `Maker futures fee for ${makerOrder.symbol}`,
      },
    ]);

    await this.syncPosition(takerUserId, market, takerOrder.side as string, quantity, price, Number(takerOrder.leverage), String(takerOrder.margin_mode), takerFee);
    await this.syncPosition(makerUserId, market, makerOrder.side as string, quantity, price, Number(makerOrder.leverage), String(makerOrder.margin_mode), makerFee);

    const currentPrice = await this.resolveMarketPrice(market.symbol);
    await supabaseAdmin.from("markets").update({
      last_price: currentPrice,
      updated_at: new Date().toISOString(),
    }).eq("id", market.id);
  }

  private async syncPosition(
    userId: string,
    market: MarketRow,
    side: string,
    quantity: number,
    price: number,
    leverage: number,
    marginMode: string,
    feePaid: number
  ) {
    const symbol = market.symbol as string;
    const currentPrice = await this.resolveMarketPrice(symbol);
    const { data: existingPosition, error: positionErr } = await supabaseAdmin
      .from("futures_positions")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .maybeSingle();

    if (positionErr) throw new Error(positionErr.message);

    const maintenanceMarginRate = 0.004;
    const currentNotional = quantity * price;
    const tradeMargin = currentNotional / leverage;
    const direction = side === "long" ? 1 : -1;

    let realizedPnl = asNumber(existingPosition?.realized_pnl ?? 0);
    let fundingPnl = asNumber(existingPosition?.funding_pnl ?? 0);
    let feePnl = asNumber(existingPosition?.fee_pnl ?? 0);
    let newQuantity = asNumber(existingPosition?.quantity ?? 0);
    let avgPrice = asNumber(existingPosition?.average_entry_price ?? 0);
    let status = existingPosition?.status ?? "open";
    let oldMargin = asNumber(existingPosition?.margin_allocated ?? 0);

    if (!existingPosition) {
      newQuantity = quantity;
      avgPrice = price;
      status = "open";
    } else if (existingPosition.side === side) {
      newQuantity = existingPosition.quantity + quantity;
      avgPrice = (existingPosition.quantity * existingPosition.average_entry_price + quantity * price) / newQuantity;
    } else {
      const closeQty = Math.min(existingPosition.quantity, quantity);
      const closePnl = direction === 1
        ? (price - Number(existingPosition.average_entry_price)) * closeQty
        : (Number(existingPosition.average_entry_price) - price) * closeQty;
      realizedPnl += closePnl;

      const remainingQty = quantity - closeQty;
      if (remainingQty > 0) {
        newQuantity = remainingQty;
        avgPrice = price;
        status = "open";
      } else {
        newQuantity = 0;
        avgPrice = 0;
        status = "closed";
      }
    }

    if (status === "closed") {
      oldMargin = 0;
    }

    const newMargin = newQuantity > 0 ? (newQuantity * currentPrice) / leverage : 0;
    const additionalMargin = Math.max(newMargin - oldMargin, 0);
    if (additionalMargin > 0) {
      await supabaseAdmin.rpc("lock_balance_for_order", {
        p_user_id: userId,
        p_asset: market.quote_asset as string,
        p_amount: additionalMargin,
      });
    }

    const marginReleased = Math.max(oldMargin - newMargin, 0);
    if (marginReleased > 0 && status === "closed") {
      await supabaseAdmin.rpc("release_locked_balance", {
        p_user_id: userId,
        p_asset: market.quote_asset as string,
        p_amount: marginReleased,
      });
    }

    const unrealizedPnl = newQuantity > 0 ? direction * (currentPrice - avgPrice) * newQuantity : 0;
    feePnl -= feePaid;
    const totalPnl = realizedPnl + fundingPnl + unrealizedPnl + feePnl;
    const maintenanceMargin = newQuantity > 0 ? newQuantity * currentPrice * maintenanceMarginRate : 0;
    const marginRatio = maintenanceMargin > 0 ? (newMargin + unrealizedPnl) / maintenanceMargin : 0;
    const liquidationPrice = newQuantity > 0
      ? (side === "long"
          ? avgPrice - (newMargin / Math.max(newQuantity, 1))
          : avgPrice + (newMargin / Math.max(newQuantity, 1)))
      : null;

    const positionPayload = {
      user_id: userId,
      market_id: market.id,
      symbol,
      side,
      quantity: newQuantity,
      average_entry_price: avgPrice,
      current_price: currentPrice,
      leverage,
      margin_mode: marginMode,
      initial_margin: newMargin,
      maintenance_margin: maintenanceMargin,
      margin_allocated: newMargin,
      unrealized_pnl: unrealizedPnl,
      realized_pnl: realizedPnl,
      funding_pnl: fundingPnl,
      fee_pnl: feePnl,
      total_pnl: totalPnl,
      liquidation_price: liquidationPrice,
      margin_ratio: marginRatio,
      status,
      updated_at: new Date().toISOString(),
      closed_at: status === "closed" ? new Date().toISOString() : null,
    };

    const { data: position, error: upsertErr } = await supabaseAdmin
      .from("futures_positions")
      .upsert(positionPayload, { onConflict: "user_id,symbol" })
      .select("*")
      .single();
    if (upsertErr || !position) throw new Error(upsertErr?.message ?? "Failed to upsert futures position");

    await supabaseAdmin.from("futures_orders").update({
      locked_margin: newMargin,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("symbol", symbol).in("status", ["accepted", "new", "partially_filled"]);

    if (status === "closed") {
      await supabaseAdmin.from("risk_events").insert({
        user_id: userId,
        symbol,
        event_type: "futures_position_closed",
        severity: "info",
        details: { position_id: position.id, realized_pnl: realizedPnl, total_pnl: totalPnl },
      });
    }

    if (marginRatio < 1 && newQuantity > 0) {
      await this.liquidatePosition(userId, symbol, currentPrice, position.id);
    }

    return position as FuturesPositionRecord;
  }

  async liquidatePosition(userId: string, symbol: string, markPrice: number, positionId?: string) {
    const { data: position, error } = await supabaseAdmin
      .from("futures_positions")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!position || Number(position.quantity) === 0) return null;

    const market = await this.getMarket(symbol);
    const liquidationFee = Number(position.margin_allocated ?? 0) * 0.05;
    const pnl = position.side === "long"
      ? (markPrice - Number(position.average_entry_price)) * Number(position.quantity)
      : (Number(position.average_entry_price) - markPrice) * Number(position.quantity);

    const liquidationEvent = {
      position_id: position.id,
      user_id: userId,
      symbol,
      side: position.side,
      mark_price: markPrice,
      liquidation_price: position.liquidation_price ?? markPrice,
      margin_ratio: Number(position.margin_ratio ?? 0),
      quantity: Number(position.quantity),
      pnl,
      liquidation_fee: liquidationFee,
      status: "triggered",
      details: { reason: "margin_ratio_breach" },
    };

    const { data: liquidation } = await supabaseAdmin
      .from("liquidation_events")
      .insert(liquidationEvent)
      .select("*")
      .single();

    await supabaseAdmin.rpc("release_locked_balance", {
      p_user_id: userId,
      p_asset: market.quote_asset as string,
      p_amount: Number(position.margin_allocated ?? 0),
    });

    await supabaseAdmin.from("insurance_fund").insert({
      symbol,
      amount: liquidationFee,
      source: "liquidation",
      details: { position_id: position.id, liquidation_id: liquidation?.id },
    });

    await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      asset: market.quote_asset as string,
      type: "adjustment",
      amount: -(pnl + liquidationFee),
      balance_after: 0,
      reference_id: liquidation?.id,
      reference_type: "liquidation",
      note: `Liquidation of ${symbol} position`,
    });

    const { data: closedPosition, error: closeErr } = await supabaseAdmin
      .from("futures_positions")
      .update({
        quantity: 0,
        unrealized_pnl: 0,
        realized_pnl: Number(position.realized_pnl ?? 0) + pnl - liquidationFee,
        funding_pnl: Number(position.funding_pnl ?? 0),
        fee_pnl: Number(position.fee_pnl ?? 0),
        total_pnl: Number(position.realized_pnl ?? 0) + Number(position.funding_pnl ?? 0) + pnl - liquidationFee,
        margin_allocated: 0,
        margin_ratio: 0,
        liquidation_price: null,
        status: "closed",
        updated_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
      })
      .eq("id", position.id)
      .select("*")
      .single();

    if (closeErr || !closedPosition) throw new Error(closeErr?.message ?? "Failed to liquidate position");

    if (liquidation?.id) {
      await supabaseAdmin.from("liquidation_events").update({
        status: "executed",
        executed_at: new Date().toISOString(),
      }).eq("id", liquidation.id);
    }

    await supabaseAdmin.from("risk_events").insert({
      user_id: userId,
      symbol,
      event_type: "futures_liquidation",
      severity: "critical",
      details: { position_id: position.id, liquidation_id: liquidation?.id, pnl, liquidation_fee: liquidationFee },
    });

    return closedPosition;
  }

  async applyFundingFees(symbol: string) {
    const market = await this.getMarket(symbol);
    const positionRows = await supabaseAdmin
      .from("futures_positions")
      .select("*")
      .eq("symbol", symbol)
      .eq("status", "open");

    if (positionRows.error) throw new Error(positionRows.error.message);

    const currentPrice = await this.resolveMarketPrice(symbol);
    for (const position of positionRows.data ?? []) {
      const fundingRate = Number(market.funding_fee_bps ?? 0) / 10000;
      const notional = Number(position.quantity) * currentPrice;
      const fundingFee = notional * fundingRate;
      const fundingPnl = position.side === "long" ? -fundingFee : fundingFee;
      const updatedFundingPnl = Number(position.funding_pnl ?? 0) + fundingPnl;
      const unrealized = position.side === "long"
        ? (currentPrice - Number(position.average_entry_price)) * Number(position.quantity)
        : (Number(position.average_entry_price) - currentPrice) * Number(position.quantity);

      const totalPnl = Number(position.realized_pnl ?? 0) + updatedFundingPnl + unrealized + Number(position.fee_pnl ?? 0);
      const nextMarginRatio = Number(position.margin_allocated ?? 0) > 0
        ? (Number(position.margin_allocated ?? 0) + unrealized) / Number(position.maintenance_margin ?? 1)
        : 0;

      await supabaseAdmin.from("futures_positions").update({
        funding_pnl: updatedFundingPnl,
        unrealized_pnl: unrealized,
        total_pnl: totalPnl,
        margin_ratio: nextMarginRatio,
        current_price: currentPrice,
        updated_at: new Date().toISOString(),
      }).eq("id", position.id);

      await supabaseAdmin.from("funding_history").insert({
        position_id: position.id,
        user_id: position.user_id,
        symbol,
        funding_rate: fundingRate,
        funding_fee: fundingFee,
        interval_start: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        interval_end: new Date().toISOString(),
        details: { current_price: currentPrice },
      });

      if (nextMarginRatio < 1) {
        await this.liquidatePosition(position.user_id, symbol, currentPrice, position.id);
      }
    }

    return { settled: (positionRows.data ?? []).length };
  }
}

export const futuresEngine = new FuturesEngine();
