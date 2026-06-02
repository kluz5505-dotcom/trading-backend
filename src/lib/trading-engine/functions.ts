import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { securityEngine } from "@/lib/security-engine/server/engine";
import { tradingEngine } from "./server/engine";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

const orderSchema = z.object({
  symbol: z.string().min(2),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit", "stop", "take_profit", "stop_loss"]),
  quantity: z.number().positive(),
  price: z.number().positive().optional().nullable(),
  stopPrice: z.number().positive().optional().nullable(),
  leverage: z.number().min(1).max(100).optional(),
  timeInForce: z.string().optional(),
  reduceOnly: z.boolean().optional(),
});

export const placeSpotOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const order = await tradingEngine.placeOrder(context.userId, data);
    void securityEngine.detectAbnormalTrading({
      userId: context.userId,
      symbol: data.symbol,
    }).catch((error) => {
      console.warn("[Security] abnormal trading detection failed", error);
    });
    return order;
  });

export const cancelSpotOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => tradingEngine.cancelOrder(context.userId, data.order_id));

export const modifySpotOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    order_id: z.string().uuid(),
    quantity: z.number().positive().optional(),
    price: z.number().positive().optional().nullable(),
    stopPrice: z.number().positive().optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => tradingEngine.modifyOrder(context.userId, data.order_id, {
    quantity: data.quantity,
    price: data.price,
    stopPrice: data.stopPrice,
  }));

export const getUserOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("user_id", context.userId)
      .order("placed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getUserPositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("positions")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getUserTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("trades")
      .select("*")
      .eq("user_id", context.userId)
      .order("executed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getTradingStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [openOrders, openPositions, tradeRows, executionRows] = await Promise.all([
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("user_id", context.userId).in("status", ["new", "partially_filled", "accepted"]),
      supabaseAdmin.from("positions").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "open"),
      supabaseAdmin.from("trades").select("id", { count: "exact", head: true }).eq("user_id", context.userId),
      supabaseAdmin.from("executions").select("id", { count: "exact", head: true }).eq("user_id", context.userId),
    ]);

    return {
      open_orders: openOrders.count ?? 0,
      open_positions: openPositions.count ?? 0,
      trade_count: tradeRows.count ?? 0,
      execution_count: executionRows.count ?? 0,
    };
  });

export const forceClosePosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ symbol: z.string().min(2), user_id: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const targetUserId = data.user_id ?? context.userId;
    const { data: position, error } = await supabaseAdmin
      .from("positions")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("symbol", data.symbol)
      .eq("status", "open")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!position) throw new Error("Open position not found");

    const market = await tradingEngine.getMarket(data.symbol);
    const { data: adminProfile } = await supabaseAdmin.from("profiles").select("*").eq("id", context.userId).maybeSingle();

    await supabaseAdmin.from("admin_logs").insert({
      actor_id: context.userId,
      actor_email: adminProfile?.email ?? null,
      action: "trading.force_close_position",
      target_type: "position",
      target_id: position.id,
      severity: "warning",
      details: { symbol: data.symbol, user_id: targetUserId, quantity: position.quantity },
    });

    return tradingEngine.placeOrder(targetUserId, {
      symbol: data.symbol,
      side: "sell",
      type: "market",
      quantity: Number(position.quantity),
      leverage: 1,
      reduceOnly: true,
    });
  });

export const haltTrading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ symbol: z.string().min(2), halt: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", context.userId).maybeSingle();
    await supabaseAdmin.from("markets").update({
      status: data.halt ? "paused" : "active",
      buy_enabled: !data.halt,
      sell_enabled: !data.halt,
      updated_at: new Date().toISOString(),
    }).eq("symbol", data.symbol);

    await supabaseAdmin.from("admin_logs").insert({
      actor_id: context.userId,
      actor_email: profile?.email ?? null,
      action: data.halt ? "trading.halt_enabled" : "trading.halt_disabled",
      target_type: "market",
      target_id: data.symbol,
      severity: "critical",
      details: { symbol: data.symbol, halt: data.halt },
    });

    return { ok: true };
  });

export const restrictUserTrading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid(), freeze: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", context.userId).maybeSingle();
    await supabaseAdmin.from("profiles").update({
      trading_frozen: data.freeze,
      updated_at: new Date().toISOString(),
    }).eq("id", data.user_id);

    await supabaseAdmin.from("admin_logs").insert({
      actor_id: context.userId,
      actor_email: profile?.email ?? null,
      action: data.freeze ? "trading.user_frozen" : "trading.user_unfrozen",
      target_type: "profile",
      target_id: data.user_id,
      severity: data.freeze ? "warning" : "info",
      details: { user_id: data.user_id, freeze: data.freeze },
    });

    return { ok: true };
  });

export const getAdminTradingSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [openOrders, openPositions, trades, adminLogs] = await Promise.all([
      supabaseAdmin.from("orders").select("*").in("status", ["new", "accepted", "partially_filled"]).order("placed_at", { ascending: false }).limit(100),
      supabaseAdmin.from("positions").select("*").eq("status", "open").order("updated_at", { ascending: false }).limit(100),
      supabaseAdmin.from("trades").select("*").order("executed_at", { ascending: false }).limit(100),
      supabaseAdmin.from("admin_logs").select("*").order("created_at", { ascending: false }).limit(100),
    ]);

    return {
      open_orders: openOrders.data ?? [],
      open_positions: openPositions.data ?? [],
      recent_trades: trades.data ?? [],
      admin_logs: adminLogs.data ?? [],
    };
  });
