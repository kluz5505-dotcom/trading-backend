import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { securityEngine } from "@/lib/security-engine/server/engine";
import { futuresEngine } from "./server/engine";

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

const futuresOrderSchema = z.object({
  symbol: z.string().min(2),
  side: z.enum(["long", "short"]),
  orderType: z.enum(["market", "limit", "stop_market", "stop_limit", "take_profit", "stop_loss", "trailing_stop"]),
  quantity: z.number().positive(),
  price: z.number().positive().optional().nullable(),
  triggerPrice: z.number().positive().optional().nullable(),
  trailingDistance: z.number().positive().optional().nullable(),
  leverage: z.number().min(1).max(100).optional(),
  marginMode: z.enum(["isolated", "cross"]).optional(),
  reduceOnly: z.boolean().optional(),
  postOnly: z.boolean().optional(),
});

export const placeFuturesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => futuresOrderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const order = await futuresEngine.placeOrder(context.userId, data);
    void securityEngine.detectAbnormalTrading({
      userId: context.userId,
      symbol: data.symbol,
    }).catch((error) => {
      console.warn("[Security] abnormal trading detection failed", error);
    });
    return order;
  });

export const cancelFuturesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => futuresEngine.cancelOrder(context.userId, data.order_id));

export const modifyFuturesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    order_id: z.string().uuid(),
    quantity: z.number().positive().optional(),
    price: z.number().positive().optional().nullable(),
    triggerPrice: z.number().positive().optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => futuresEngine.modifyOrder(context.userId, data.order_id, {
    quantity: data.quantity,
    price: data.price,
    triggerPrice: data.triggerPrice,
  }));

export const getUserFuturesOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("futures_orders")
      .select("*")
      .eq("user_id", context.userId)
      .order("placed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getUserFuturesPositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("futures_positions")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getUserFuturesFunding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("funding_history")
      .select("*")
      .eq("user_id", context.userId)
      .order("settled_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const settleFuturesFunding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ symbol: z.string().min(2) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return futuresEngine.applyFundingFees(data.symbol);
  });

export const forceLiquidateFuturesPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ symbol: z.string().min(2), user_id: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const targetUserId = data.user_id ?? context.userId;
    const marketPrice = await futuresEngine.resolveMarketPrice(data.symbol);
    return futuresEngine.liquidatePosition(targetUserId, data.symbol, marketPrice);
  });

export const haltFuturesTrading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ symbol: z.string().min(2), halt: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", context.userId).maybeSingle();
    await supabaseAdmin.from("markets")
      .update({
        status: data.halt ? "paused" : "active",
        maintenance_mode: data.halt,
        updated_at: new Date().toISOString(),
      })
      .eq("symbol", data.symbol)
      .eq("market_type", "futures");

    await supabaseAdmin.from("admin_logs").insert({
      actor_id: context.userId,
      actor_email: profile?.email ?? null,
      action: data.halt ? "futures.halt_enabled" : "futures.halt_disabled",
      target_type: "market",
      target_id: data.symbol,
      severity: "critical",
      details: { symbol: data.symbol, halt: data.halt },
    });

    return { ok: true };
  });

export const getAdminFuturesSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [openOrders, openPositions, liquidations, fundingHistory, riskEvents] = await Promise.all([
      supabaseAdmin.from("futures_orders").select("*").in("status", ["new", "accepted", "partially_filled", "triggered"]).order("placed_at", { ascending: false }).limit(100),
      supabaseAdmin.from("futures_positions").select("*").eq("status", "open").order("updated_at", { ascending: false }).limit(100),
      supabaseAdmin.from("liquidation_events").select("*").order("triggered_at", { ascending: false }).limit(100),
      supabaseAdmin.from("funding_history").select("*").order("settled_at", { ascending: false }).limit(100),
      supabaseAdmin.from("risk_events").select("*").order("created_at", { ascending: false }).limit(100),
    ]);

    return {
      open_orders: openOrders.data ?? [],
      open_positions: openPositions.data ?? [],
      liquidations: liquidations.data ?? [],
      funding_history: fundingHistory.data ?? [],
      risk_events: riskEvents.data ?? [],
    };
  });
