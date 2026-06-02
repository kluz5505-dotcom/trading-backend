import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { MarketDashboardItem, MarketDetailRecord, MarketOverviewSnapshot } from "./types";

const MARKET_EDITOR_ROLES = ["admin", "moderator"] as const;
const MARKET_EDITOR_ROLES_SET = new Set<string>(MARKET_EDITOR_ROLES as readonly string[]);
const MARKET_EDITOR_ROLES_LIST: Database["public"]["Enums"]["app_role"][] = ["admin", "moderator"];

type MarketEditorRole = (typeof MARKET_EDITOR_ROLES)[number];

function normalizeEditorRole(role: unknown): MarketEditorRole | null {
  if (typeof role !== "string") return null;
  const normalized = role.toLowerCase();
  if (normalized === "admin" || normalized === "moderator") {
    return normalized as MarketEditorRole;
  }
  return null;
}

async function assertMarketEditor(context: { userId: string; claims: Record<string, unknown> }) {
  const metadataRole = normalizeEditorRole(
    (context.claims.app_metadata as Record<string, unknown> | undefined)?.role ??
      (context.claims.user_metadata as Record<string, unknown> | undefined)?.role,
  );

  if (metadataRole && MARKET_EDITOR_ROLES_SET.has(metadataRole)) {
    return { role: metadataRole };
  }

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .in("role", MARKET_EDITOR_ROLES_LIST)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data?.role) {
      const resolved = normalizeEditorRole(data.role);
      if (resolved && MARKET_EDITOR_ROLES_SET.has(resolved)) {
        return { role: resolved };
      }
    }
  throw new Error("Forbidden: super_admin or market_admin required");
}

async function writeMarketAudit(
  actorId: string,
  actorEmail: string | undefined,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    actor_email: actorEmail ?? null,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details as never,
  });
}

async function writeMarketEvent(
  symbol: string,
  marketId: string | null,
  eventType: string,
  details: Record<string, unknown>,
  actorId: string,
  actorEmail: string | undefined,
) {
  await supabaseAdmin.from("market_events").insert({
    market_id: marketId,
    symbol,
    event_type: eventType,
    details: details as never,
    actor_id: actorId,
    actor_email: actorEmail ?? null,
  } as never);
}

function computeMarketStatus(market: Database["public"]["Tables"]["markets"]["Row"]): MarketDashboardItem["market_status"] {
  if (market.status === "disabled") return "delisted";
  if (market.maintenance_mode) return "maintenance";
  if (market.status === "paused") return "paused";
  if (market.hidden_from_frontend) return "hidden";
  if (!market.buy_enabled || !market.sell_enabled) return "restricted";
  return "live";
}

function buildMarketDashboardItem(
  market: Database["public"]["Tables"]["markets"]["Row"],
  override: Database["public"]["Tables"]["market_price_overrides"]["Row"] | null,
  marketEvents: Database["public"]["Tables"]["market_events"]["Row"][],
  transactions: Database["public"]["Tables"]["transactions"]["Row"][],
): MarketDashboardItem {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const relatedTransactions = transactions.filter((entry) => entry.created_at && new Date(entry.created_at).getTime() >= dayAgo && (entry.asset === market.base_asset || entry.asset === market.quote_asset));
  const recentEvents = marketEvents.filter((entry) => entry.created_at && new Date(entry.created_at).getTime() >= dayAgo && entry.symbol === market.symbol);

  return {
    ...market,
    market_status: computeMarketStatus(market),
    recent_transaction_count_24h: relatedTransactions.length,
    recent_market_event_count_24h: recentEvents.length,
    override_price: override?.override_price ?? null,
    override_reason: override?.reason ?? null,
    override_expires_at: override?.expires_at ?? null,
  };
}

const marketControlSchema = z.object({
  symbol: z.string().min(1),
  category: z.string().max(50).optional(),
  display_name: z.string().max(200).nullable().optional(),
  status: z.enum(["active", "paused", "delisted"]).optional(),
  market_type: z.enum(["spot", "futures", "forex", "indices", "commodities"]).optional(),
  maintenance_mode: z.boolean().optional(),
  maintenance_message: z.string().max(500).nullable().optional(),
  hidden_from_frontend: z.boolean().optional(),
  buy_enabled: z.boolean().optional(),
  sell_enabled: z.boolean().optional(),
  leverage_enabled: z.boolean().optional(),
  market_order_enabled: z.boolean().optional(),
  limit_order_enabled: z.boolean().optional(),
  stop_order_enabled: z.boolean().optional(),
  tp_sl_enabled: z.boolean().optional(),
  trailing_stop_enabled: z.boolean().optional(),
  max_leverage: z.number().int().min(1).max(1000).optional(),
  min_leverage: z.number().int().min(1).max(1000).optional(),
  maintenance_margin_bps: z.number().int().min(1).max(10000).optional(),
  liquidation_threshold_bps: z.number().int().min(1).max(10000).optional(),
  taker_fee_bps: z.number().int().min(0).max(10000).optional(),
  maker_fee_bps: z.number().int().min(0).max(10000).optional(),
  funding_fee_bps: z.number().int().min(0).max(10000).optional(),
  spread_bps: z.number().int().min(0).max(10000).optional(),
  liquidity_factor: z.number().min(0).max(100).optional(),
  slippage_max_bps: z.number().int().min(0).max(10000).optional(),
  min_order_size: z.number().min(0).optional(),
  max_order_size: z.number().min(0).nullable().optional(),
  max_position_size: z.number().min(0).nullable().optional(),
  max_open_positions: z.number().int().min(0).nullable().optional(),
  price_source: z.string().max(50).optional(),
  price_source_symbol: z.string().max(50).nullable().optional(),
  backup_price_source: z.string().max(50).nullable().optional(),
  price_deviation_max_bps: z.number().int().min(1).max(10000).optional(),
  flash_crash_protection: z.boolean().optional(),
  price_frozen: z.boolean().optional(),
  weekend_trading: z.boolean().optional(),
  session_schedule: z.any().optional(),
}).passthrough();

export const listMarketDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    search: z.string().max(200).optional().default(""),
    category: z.string().max(50).optional().nullable(),
    status: z.enum(["active", "paused", "delisted", "maintenance"]).optional().nullable(),
    limit: z.number().int().min(10).max(500).optional().default(250),
    offset: z.number().int().min(0).optional().default(0),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMarketEditor(context);

    const [marketsResult, overridesResult, marketEventsResult, transactionsResult, profilesResult] = await Promise.all([
      supabaseAdmin.from("markets").select("*").order("category").order("symbol"),
      supabaseAdmin.from("market_price_overrides").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("market_events").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("transactions").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }),
    ]);

    if (marketsResult.error) throw new Error(marketsResult.error.message);
    if (overridesResult.error) throw new Error(overridesResult.error.message);
    if (marketEventsResult.error) throw new Error(marketEventsResult.error.message);
    if (transactionsResult.error) throw new Error(transactionsResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const overrideBySymbol = new Map<string, Database["public"]["Tables"]["market_price_overrides"]["Row"]>();
    (overridesResult.data ?? []).forEach((entry) => overrideBySymbol.set(entry.symbol, entry));

    const search = data.search.trim().toLowerCase();
    const filteredMarkets = (marketsResult.data ?? []).filter((market) => {
      if (data.category && market.category !== data.category) return false;
      if (data.status) {
        if (data.status === "maintenance" && !market.maintenance_mode) return false;
        if (data.status !== "maintenance" && market.status !== data.status) return false;
      }
      if (!search) return true;
      return [market.symbol, market.display_name, market.base_asset, market.quote_asset, market.category].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
    }).slice(data.offset, data.offset + data.limit);

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const marketDashboardItems = filteredMarkets.map((market) => buildMarketDashboardItem(
      market,
      overrideBySymbol.get(market.symbol) ?? null,
      marketEventsResult.data ?? [],
      transactionsResult.data ?? [],
    ));

    const recentTransactions24h = (transactionsResult.data ?? []).filter((entry) => new Date(entry.created_at).getTime() >= dayAgo);
    const recentMarketEvents24h = (marketEventsResult.data ?? []).filter((entry) => new Date(entry.created_at).getTime() >= dayAgo);

    const overview: MarketOverviewSnapshot = {
      markets: marketDashboardItems,
      total_markets: marketDashboardItems.length,
      live_markets: marketDashboardItems.filter((item) => item.market_status === "live").length,
      hidden_markets: marketDashboardItems.filter((item) => item.market_status === "hidden").length,
      restricted_markets: marketDashboardItems.filter((item) => item.market_status === "restricted").length,
      paused_markets: marketDashboardItems.filter((item) => item.market_status === "paused").length,
      maintenance_markets: marketDashboardItems.filter((item) => item.market_status === "maintenance").length,
      delisted_markets: marketDashboardItems.filter((item) => item.market_status === "delisted").length,
      total_profiles: profilesResult.data?.length ?? 0,
      active_profiles: (profilesResult.data ?? []).filter((profile) => profile.status === "active").length,
      suspended_profiles: (profilesResult.data ?? []).filter((profile) => profile.status === "frozen" || profile.status === "banned").length,
      recent_transactions_24h: recentTransactions24h.length,
      recent_market_events_24h: recentMarketEvents24h.length,
    };

    return overview;
  });

export const getMarketDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ symbol: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMarketEditor(context);

    const { data: market, error: marketError } = await supabaseAdmin.from("markets").select("*").eq("symbol", data.symbol).maybeSingle();
    if (marketError) throw new Error(marketError.message);
    if (!market) throw new Error("Market not found");

    const [overrideResult, marketEventsResult, transactionsResult, profilesResult, auditResult] = await Promise.all([
      supabaseAdmin.from("market_price_overrides").select("*").eq("symbol", data.symbol).maybeSingle(),
      supabaseAdmin.from("market_events").select("*").eq("symbol", data.symbol).order("created_at", { ascending: false }).limit(250),
      supabaseAdmin.from("transactions").select("*").or(`asset.eq.${market.base_asset},asset.eq.${market.quote_asset}`).order("created_at", { ascending: false }).limit(250),
      supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("audit_logs").select("*").or(`target_id.eq.${market.id},target_type.eq.market`).order("created_at", { ascending: false }).limit(250),
    ]);

    if (overrideResult.error) throw new Error(overrideResult.error.message);
    if (marketEventsResult.error) throw new Error(marketEventsResult.error.message);
    if (transactionsResult.error) throw new Error(transactionsResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (auditResult.error) throw new Error(auditResult.error.message);

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const profileStats = {
      total_profiles: profilesResult.data?.length ?? 0,
      active_profiles: (profilesResult.data ?? []).filter((profile) => profile.status === "active").length,
      frozen_profiles: (profilesResult.data ?? []).filter((profile) => profile.status === "frozen").length,
      banned_profiles: (profilesResult.data ?? []).filter((profile) => profile.status === "banned").length,
      recent_signups_24h: (profilesResult.data ?? []).filter((profile) => new Date(profile.created_at).getTime() >= dayAgo).length,
    };

    const detail: MarketDetailRecord = {
      market,
      override: overrideResult.data ?? null,
      market_events: marketEventsResult.data ?? [],
      recent_transactions: transactionsResult.data ?? [],
      profile_stats: profileStats,
      audit_entries: auditResult.data ?? [],
    };

    return detail;
  });

export const updateMarketControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => marketControlSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertMarketEditor(context);

    const { symbol, ...patch } = data;
    const { data: updatedMarket, error } = await supabaseAdmin
      .from("markets")
      .update({
        ...patch,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("symbol", symbol)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    if (!updatedMarket) throw new Error("Market update failed");

    await writeMarketEvent(symbol, updatedMarket.id, "control_update", patch as Record<string, unknown>, context.userId, context.claims.email as string | undefined);
    await writeMarketAudit(context.userId, context.claims.email as string | undefined, "market.control_update", "market", updatedMarket.id, patch as Record<string, unknown>);

    return updatedMarket;
  });

export const marketEmergencyAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    symbol: z.string().min(1),
    action: z.enum(["pause", "resume", "shutdown", "maintenance_on", "maintenance_off", "hide", "unhide", "freeze_price", "unfreeze_price", "halt_buy", "halt_sell", "resume_buy", "resume_sell"]),
    reason: z.string().max(500).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMarketEditor(context);

    const patch: Record<string, unknown> = { updated_by: context.userId, updated_at: new Date().toISOString() };
    switch (data.action) {
      case "pause":
        patch.status = "paused";
        patch.buy_enabled = false;
        patch.sell_enabled = false;
        break;
      case "resume":
        patch.status = "active";
        patch.buy_enabled = true;
        patch.sell_enabled = true;
        patch.maintenance_mode = false;
        break;
      case "shutdown":
        patch.status = "paused";
        patch.buy_enabled = false;
        patch.sell_enabled = false;
        patch.maintenance_mode = true;
        break;
      case "maintenance_on":
        patch.maintenance_mode = true;
        break;
      case "maintenance_off":
        patch.maintenance_mode = false;
        break;
      case "hide":
        patch.hidden_from_frontend = true;
        break;
      case "unhide":
        patch.hidden_from_frontend = false;
        break;
      case "freeze_price":
        patch.price_frozen = true;
        break;
      case "unfreeze_price":
        patch.price_frozen = false;
        break;
      case "halt_buy":
        patch.buy_enabled = false;
        break;
      case "halt_sell":
        patch.sell_enabled = false;
        break;
      case "resume_buy":
        patch.buy_enabled = true;
        break;
      case "resume_sell":
        patch.sell_enabled = true;
        break;
    }

    const { data: updatedMarket, error } = await supabaseAdmin
      .from("markets")
      .update(patch as never)
      .eq("symbol", data.symbol)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    if (!updatedMarket) throw new Error("Market update failed");

    await writeMarketEvent(data.symbol, updatedMarket.id, data.action, { reason: data.reason ?? null }, context.userId, context.claims.email as string | undefined);
    await writeMarketAudit(context.userId, context.claims.email as string | undefined, `market.${data.action}`, "market", updatedMarket.id, { reason: data.reason ?? null });

    return updatedMarket;
  });

export const setPriceOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    symbol: z.string().min(1),
    override_price: z.number().positive().nullable(),
    reason: z.string().max(500).optional().nullable(),
    expires_in_min: z.number().int().min(1).max(1440).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMarketEditor(context);

    const { symbol, override_price, reason } = data;
    if (override_price === null) {
      await supabaseAdmin.from("market_price_overrides").delete().eq("symbol", symbol);
      await writeMarketEvent(symbol, null, "price_override_cleared", { reason: reason ?? null }, context.userId, context.claims.email as string | undefined);
      await writeMarketAudit(context.userId, context.claims.email as string | undefined, "market.price_override_cleared", "market", symbol, { reason: reason ?? null });
      return { ok: true };
    }

    const expires_at = data.expires_in_min ? new Date(Date.now() + data.expires_in_min * 60_000).toISOString() : null;
    const { error } = await supabaseAdmin.from("market_price_overrides").upsert({
      symbol,
      override_price,
      reason: reason ?? null,
      expires_at,
      created_by: context.userId,
    } as never, { onConflict: "symbol" });

    if (error) throw new Error(error.message);

    await writeMarketEvent(symbol, null, "price_override_set", { override_price, reason: reason ?? null, expires_at }, context.userId, context.claims.email as string | undefined);
    await writeMarketAudit(context.userId, context.claims.email as string | undefined, "market.price_override_set", "market", symbol, { override_price, reason: reason ?? null, expires_at });

    return { ok: true };
  });

export const getRecentMarketEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    symbol: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(250).optional().default(100),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMarketEditor(context);

    let query = supabaseAdmin.from("market_events").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.symbol) query = query.eq("symbol", data.symbol);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((row) => ({
      ...row,
      details_json: JSON.stringify(row.details ?? {}),
    }));
  });
