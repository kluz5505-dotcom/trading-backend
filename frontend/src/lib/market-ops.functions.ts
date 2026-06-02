import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

async function logEvent(symbol: string, type: string, details: Record<string, unknown>, actorId: string, email?: string) {
  await supabaseAdmin.from("market_events" as never).insert({
    symbol, event_type: type, details, actor_id: actorId, actor_email: email ?? null,
  } as never);
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId, actor_email: email ?? null,
    action: `market.${type}`, target_id: symbol, target_type: "market",
    details: details as never,
  });
}

// ============ LIST all markets with full operational state ============
export const listMarketsFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin.from("markets").select("*").order("category").order("symbol");
    if (error) throw new Error(error.message);
    const { data: overrides } = await supabaseAdmin.from("market_price_overrides" as never).select("*") as { data: Array<{ symbol: string; override_price: number; expires_at: string | null }> | null };
    const ovMap = new Map((overrides ?? []).map((o) => [o.symbol, o]));
    return (data ?? []).map((m) => ({ ...m, override: ovMap.get(m.symbol) ?? null }));
  });

// ============ UPDATE market (full control payload) ============
const marketPatch = z.object({
  symbol: z.string().min(2).max(20),
  // status
  status: z.enum(["active", "paused", "delisted"]).optional(),
  maintenance_mode: z.boolean().optional(),
  maintenance_message: z.string().max(500).nullable().optional(),
  hidden_from_frontend: z.boolean().optional(),
  // trading switches
  buy_enabled: z.boolean().optional(),
  sell_enabled: z.boolean().optional(),
  leverage_enabled: z.boolean().optional(),
  // order types
  market_order_enabled: z.boolean().optional(),
  limit_order_enabled: z.boolean().optional(),
  stop_order_enabled: z.boolean().optional(),
  tp_sl_enabled: z.boolean().optional(),
  trailing_stop_enabled: z.boolean().optional(),
  // leverage & margin
  max_leverage: z.number().int().min(1).max(1000).optional(),
  min_leverage: z.number().int().min(1).max(1000).optional(),
  maintenance_margin_bps: z.number().int().min(1).max(10000).optional(),
  liquidation_threshold_bps: z.number().int().min(1).max(10000).optional(),
  // fees
  taker_fee_bps: z.number().int().min(0).max(10000).optional(),
  maker_fee_bps: z.number().int().min(0).max(10000).optional(),
  funding_fee_bps: z.number().int().min(0).max(10000).optional(),
  spread_bps: z.number().int().min(0).max(10000).optional(),
  // liquidity / risk
  liquidity_factor: z.number().min(0).max(100).optional(),
  slippage_max_bps: z.number().int().min(0).max(10000).optional(),
  min_order_size: z.number().min(0).optional(),
  max_order_size: z.number().min(0).nullable().optional(),
  max_position_size: z.number().min(0).nullable().optional(),
  max_open_positions: z.number().int().min(0).nullable().optional(),
  // price feed
  price_source: z.enum(["binance", "external", "manual"]).optional(),
  price_source_symbol: z.string().max(20).nullable().optional(),
  backup_price_source: z.string().max(20).nullable().optional(),
  price_deviation_max_bps: z.number().int().min(1).max(10000).optional(),
  flash_crash_protection: z.boolean().optional(),
  price_frozen: z.boolean().optional(),
  // sessions
  weekend_trading: z.boolean().optional(),
});

export const updateMarket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => marketPatch.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { symbol, ...patch } = data;
    const { error } = await supabaseAdmin.from("markets").update({
      ...patch, updated_by: context.userId, updated_at: new Date().toISOString(),
    } as never).eq("symbol", symbol);
    if (error) throw new Error(error.message);
    await logEvent(symbol, "update", patch, context.userId, context.claims.email as string | undefined);
    return { ok: true };
  });

// ============ EMERGENCY: pause / resume / shutdown ============
export const marketEmergencyAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    symbol: z.string(),
    action: z.enum(["pause", "resume", "shutdown", "maintenance_on", "maintenance_off", "hide", "unhide", "freeze_price", "unfreeze_price", "halt_buy", "halt_sell", "resume_buy", "resume_sell"]),
    reason: z.string().max(500).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch: Record<string, unknown> = { updated_by: context.userId, updated_at: new Date().toISOString() };
    switch (data.action) {
      case "pause": patch.status = "paused"; break;
      case "resume": patch.status = "active"; break;
      case "shutdown": patch.status = "paused"; patch.buy_enabled = false; patch.sell_enabled = false; patch.maintenance_mode = true; break;
      case "maintenance_on": patch.maintenance_mode = true; break;
      case "maintenance_off": patch.maintenance_mode = false; break;
      case "hide": patch.hidden_from_frontend = true; break;
      case "unhide": patch.hidden_from_frontend = false; break;
      case "freeze_price": patch.price_frozen = true; break;
      case "unfreeze_price": patch.price_frozen = false; break;
      case "halt_buy": patch.buy_enabled = false; break;
      case "halt_sell": patch.sell_enabled = false; break;
      case "resume_buy": patch.buy_enabled = true; break;
      case "resume_sell": patch.sell_enabled = true; break;
    }
    const { error } = await supabaseAdmin.from("markets").update(patch as never).eq("symbol", data.symbol);
    if (error) throw new Error(error.message);
    await logEvent(data.symbol, data.action, { reason: data.reason ?? null }, context.userId, context.claims.email as string | undefined);
    return { ok: true };
  });

// ============ BULK category action ============
export const marketCategoryAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    category: z.enum(["crypto", "forex", "indices", "commodities"]),
    action: z.enum(["pause_all", "resume_all", "hide_all", "unhide_all"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch: Record<string, unknown> = { updated_by: context.userId, updated_at: new Date().toISOString() };
    if (data.action === "pause_all") patch.status = "paused";
    if (data.action === "resume_all") patch.status = "active";
    if (data.action === "hide_all") patch.hidden_from_frontend = true;
    if (data.action === "unhide_all") patch.hidden_from_frontend = false;
    const { error } = await supabaseAdmin.from("markets").update(patch as never).eq("category", data.category);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId, actor_email: (context.claims.email as string) ?? null,
      action: `market.category_${data.action}`, target_id: data.category, target_type: "market_category",
      details: {} as never,
    });
    return { ok: true };
  });

// ============ PRICE OVERRIDE ============
export const setPriceOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    symbol: z.string(),
    override_price: z.number().positive().nullable(),
    reason: z.string().max(500).optional(),
    expires_in_min: z.number().int().min(1).max(1440).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.override_price === null) {
      await supabaseAdmin.from("market_price_overrides" as never).delete().eq("symbol", data.symbol);
      await logEvent(data.symbol, "price_override_cleared", {}, context.userId, context.claims.email as string | undefined);
      return { ok: true };
    }
    const expires_at = data.expires_in_min ? new Date(Date.now() + data.expires_in_min * 60_000).toISOString() : null;
    await supabaseAdmin.from("market_price_overrides" as never).upsert({
      symbol: data.symbol, override_price: data.override_price, reason: data.reason ?? null,
      expires_at, created_by: context.userId,
    } as never, { onConflict: "symbol" });
    await logEvent(data.symbol, "price_override_set", { price: data.override_price, expires_at }, context.userId, context.claims.email as string | undefined);
    return { ok: true };
  });

// ============ MARKET EVENTS (recent feed) ============
export const recentMarketEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin.from("market_events" as never)
      .select("*").order("created_at", { ascending: false }).limit(100);
    const rows = (data ?? []) as Array<{ id: string; symbol: string; event_type: string; details: unknown; actor_email: string | null; created_at: string }>;
    return rows.map((r) => ({
      id: r.id, symbol: r.symbol, event_type: r.event_type,
      actor_email: r.actor_email, created_at: r.created_at,
      details_json: JSON.stringify(r.details ?? {}),
    }));
  });
