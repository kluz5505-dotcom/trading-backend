import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/**
 * Real-time operations metrics for the control center.
 * Returns 24h flows, online sessions estimate, system health,
 * suspicious activity counters, and a recent activity feed.
 */
export const opsMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since15m = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const since1h = new Date(Date.now() - 3600 * 1000).toISOString();

    const t0 = Date.now();
    const [
      usersTotal, usersActive, usersFrozen, usersBanned,
      dep24h, wd24h, depPending, wdPending, kycPending,
      sessions15m, audit50, depRecent, wdRecent,
      assetsRow, marketsRow, settings,
      txCount, failedWd, suspiciousEvents, openFraudFlags, monitoringEvents,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "frozen"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "banned"),
      supabaseAdmin.from("deposits").select("amount, asset, status").gte("created_at", since24h),
      supabaseAdmin.from("withdrawals").select("amount, fee, asset, status").gte("created_at", since24h),
      supabaseAdmin.from("deposits").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("withdrawals").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("kyc_submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("login_history").select("user_id, ip_address, created_at").gte("created_at", since15m),
      supabaseAdmin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("deposits").select("id,user_id,amount,asset,network,status,created_at").order("created_at", { ascending: false }).limit(8),
      supabaseAdmin.from("withdrawals").select("id,user_id,amount,asset,network,status,created_at,ip_address").order("created_at", { ascending: false }).limit(8),
      supabaseAdmin.from("assets").select("symbol", { count: "exact", head: true }).eq("enabled", true),
      supabaseAdmin.from("markets").select("symbol", { count: "exact", head: true }).eq("status", "active"),
      supabaseAdmin.from("platform_settings").select("*").eq("id", 1).maybeSingle(),
      supabaseAdmin.from("transactions").select("id", { count: "exact", head: true }).gte("created_at", since1h),
      supabaseAdmin.from("withdrawals").select("id", { count: "exact", head: true }).eq("status", "rejected").gte("created_at", since24h),
      supabaseAdmin.from("security_events").select("id", { count: "exact", head: true }).gte("created_at", since24h).in("severity", ["high", "critical"]),
      supabaseAdmin.from("fraud_flags").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.from("monitoring_events").select("id", { count: "exact", head: true }).gte("created_at", since1h).in("status", ["warning", "critical", "failed"]),
    ]);
    const dbLatency = Date.now() - t0;

    const sumByAsset = (rows: Array<{ amount: unknown; asset: string; status: string }> | null, statuses: string[]) => {
      const out: Record<string, number> = {};
      (rows ?? []).filter((r) => statuses.includes(r.status)).forEach((r) => {
        out[r.asset] = (out[r.asset] ?? 0) + Number(r.amount);
      });
      return out;
    };

    const onlineSet = new Set((sessions15m.data ?? []).map((s) => s.user_id));
    const ipSet = new Set((sessions15m.data ?? []).map((s) => s.ip_address ? String(s.ip_address) : "").filter(Boolean));

    // Suspicious: withdrawals > 10k USDT-equivalent or repeated rejections
    const largeWd = (wd24h.data ?? []).filter((w) => Number(w.amount) >= 10000).length;

    return {
      ts: new Date().toISOString(),
      health: {
        db_ok: !usersTotal.error,
        db_latency_ms: dbLatency,
        api_ok: true,
        ws_ok: true, // Binance ws is browser-side
        platform: settings.data ?? null,
      },
      users: {
        total: usersTotal.count ?? 0,
        active: usersActive.count ?? 0,
        frozen: usersFrozen.count ?? 0,
        banned: usersBanned.count ?? 0,
        online_15m: onlineSet.size,
        unique_ips_15m: ipSet.size,
      },
      flows_24h: {
        deposits_count: (dep24h.data ?? []).length,
        deposits_approved: sumByAsset(dep24h.data, ["approved"]),
        deposits_pending: sumByAsset(dep24h.data, ["pending"]),
        withdrawals_count: (wd24h.data ?? []).length,
        withdrawals_approved: sumByAsset(wd24h.data, ["approved"]),
        withdrawals_pending: sumByAsset(wd24h.data, ["pending"]),
        large_withdrawals: largeWd,
        failed_withdrawals: failedWd.count ?? 0,
      },
      queues: {
        deposits_pending: depPending.count ?? 0,
        withdrawals_pending: wdPending.count ?? 0,
        kyc_pending: kycPending.count ?? 0,
      },
      markets: {
        active_assets: assetsRow.count ?? 0,
        active_markets: marketsRow.count ?? 0,
      },
      activity_1h: {
        transactions: txCount.count ?? 0,
      },
      security_summary: {
        suspicious_events_24h: suspiciousEvents.count ?? 0,
        open_fraud_flags: openFraudFlags.count ?? 0,
        warning_monitoring_events_1h: monitoringEvents.count ?? 0,
      },
      recent_audit: (audit50.data ?? []).map((r) => {
        const { ip_address: _ip, ...rest } = r;
        return { ...rest, ip_address: r.ip_address ? String(r.ip_address) : null };
      }),
      recent_deposits: depRecent.data ?? [],
      recent_withdrawals: (wdRecent.data ?? []).map((w) => ({
        ...w,
        ip_address: w.ip_address ? String(w.ip_address) : null,
      })),
    };
  });
