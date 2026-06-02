import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { monitoringEngine } from "@/lib/monitoring-engine/server/engine";

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

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function runValidationSnapshot() {
  const startedAt = Date.now();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [balances, positions, futuresPositions, pnlHistory, liquidationEvents, deposits, withdrawals, securityEvents, monitoringEvents, incidents] = await Promise.all([
    supabaseAdmin.from("balances").select("asset, available, locked, updated_at"),
    supabaseAdmin.from("positions").select("id, symbol, quantity, average_entry_price, unrealized_pnl, updated_at"),
    supabaseAdmin.from("futures_positions").select("id, symbol, quantity, margin_ratio, liquidation_price, updated_at"),
    supabaseAdmin.from("pnl_history").select("id, realized_pnl, unrealized_pnl, total_pnl, created_at"),
    supabaseAdmin.from("liquidation_events").select("id, status, triggered_at").gte("triggered_at", since24h),
    supabaseAdmin.from("deposits").select("id, status").eq("status", "pending"),
    supabaseAdmin.from("withdrawals").select("id, status").eq("status", "pending"),
    supabaseAdmin.from("security_events").select("id, severity").gte("created_at", since24h),
    supabaseAdmin.from("monitoring_events").select("id, service, event_type, severity, status, created_at").gte("created_at", since1h),
    supabaseAdmin.from("incidents").select("id, status").eq("status", "open"),
  ]);

  const negativeBalances = (balances.data ?? []).filter((row) => asNumber(row.available) < 0 || asNumber(row.locked) < 0);
  const invalidSpotPositions = (positions.data ?? []).filter((row) => asNumber(row.quantity) < 0 || Number.isNaN(asNumber(row.average_entry_price)) || asNumber(row.average_entry_price) <= 0);
  const pnlAnomalies = (pnlHistory.data ?? []).filter((row) => Math.abs(asNumber(row.total_pnl) - (asNumber(row.realized_pnl) + asNumber(row.unrealized_pnl))) > 0.01);
  const openFutures = (futuresPositions.data ?? []).filter((row) => asNumber(row.quantity) !== 0);
  const riskyFutures = openFutures.filter((row) => asNumber(row.margin_ratio) < 1.1);
  const pendingDeposits = deposits.data?.length ?? 0;
  const pendingWithdrawals = withdrawals.data?.length ?? 0;
  const highSeveritySecurity = (securityEvents.data ?? []).filter((row) => row.severity === "high" || row.severity === "critical");
  const recentMonitoring = monitoringEvents.data ?? [];
  const liquidationCount = liquidationEvents.data?.length ?? 0;

  const checks = [
    {
      name: "Wallet balance integrity",
      status: negativeBalances.length === 0 ? "pass" : "fail",
      severity: negativeBalances.length === 0 ? "info" : "critical",
      message: negativeBalances.length === 0
        ? "No wallet balances are negative"
        : `${negativeBalances.length} balances fall below zero`,
      metric: negativeBalances.length,
    },
    {
      name: "Spot position accounting",
      status: invalidSpotPositions.length === 0 ? "pass" : "fail",
      severity: invalidSpotPositions.length === 0 ? "info" : "critical",
      message: invalidSpotPositions.length === 0
        ? "Spot positions have valid quantities and entry pricing"
        : `${invalidSpotPositions.length} spot positions show invalid accounting`,
      metric: invalidSpotPositions.length,
    },
    {
      name: "PnL consistency",
      status: pnlAnomalies.length === 0 ? "pass" : "warning",
      severity: pnlAnomalies.length === 0 ? "info" : "warning",
      message: pnlAnomalies.length === 0
        ? "PnL snapshots remain internally consistent"
        : `${pnlAnomalies.length} PnL snapshots differ from realized + unrealized totals`,
      metric: pnlAnomalies.length,
    },
    {
      name: "Futures liquidation readiness",
      status: riskyFutures.length === 0 ? "pass" : liquidationCount > 0 ? "pass" : "warning",
      severity: riskyFutures.length === 0 ? "info" : liquidationCount > 0 ? "info" : "warning",
      message: riskyFutures.length === 0
        ? "No open futures positions are currently in breach territory"
        : liquidationCount > 0
          ? `${riskyFutures.length} open futures positions are under stress, and ${liquidationCount} liquidations were recorded recently`
          : `${riskyFutures.length} open futures positions are under stress, but no liquidation events were recorded recently`,
      metric: riskyFutures.length,
    },
    {
      name: "Realtime monitoring coverage",
      status: recentMonitoring.length > 0 ? "pass" : "warning",
      severity: recentMonitoring.length > 0 ? "info" : "warning",
      message: recentMonitoring.length > 0
        ? `${recentMonitoring.length} monitoring events updated in the last hour`
        : "No monitoring events were recorded in the last hour",
      metric: recentMonitoring.length,
    },
    {
      name: "Security telemetry",
      status: highSeveritySecurity.length === 0 ? "warning" : "pass",
      severity: highSeveritySecurity.length === 0 ? "warning" : "info",
      message: highSeveritySecurity.length === 0
        ? "No high or critical security events were seen in the last 24 hours"
        : `${highSeveritySecurity.length} high/critical security events are active`,
      metric: highSeveritySecurity.length,
    },
    {
      name: "Operational queue health",
      status: pendingDeposits + pendingWithdrawals > 100 ? "warning" : "pass",
      severity: pendingDeposits + pendingWithdrawals > 100 ? "warning" : "info",
      message: pendingDeposits + pendingWithdrawals > 100
        ? `${pendingDeposits + pendingWithdrawals} pending transactions are backlogged`
        : `${pendingDeposits + pendingWithdrawals} pending transactions are within normal bounds`,
      metric: pendingDeposits + pendingWithdrawals,
    },
  ];

  const failCount = checks.filter((check) => check.status === "fail").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;
  const overallStatus = failCount > 0 ? "critical" : warningCount > 0 ? "warning" : "healthy";

  return {
    ts: new Date().toISOString(),
    runtime_ms: Date.now() - startedAt,
    overall_status: overallStatus,
    check_count: checks.length,
    passing: checks.filter((check) => check.status === "pass").length,
    failing: failCount,
    warnings: warningCount,
    checks,
    metrics: {
      wallet_balances: balances.data?.length ?? 0,
      spot_positions: positions.data?.length ?? 0,
      futures_positions: futuresPositions.data?.length ?? 0,
      pnl_snapshots: pnlHistory.data?.length ?? 0,
      liquidation_events_24h: liquidationCount,
      pending_deposits: pendingDeposits,
      pending_withdrawals: pendingWithdrawals,
      high_severity_security_events_24h: highSeveritySecurity.length,
      monitoring_events_last_hour: recentMonitoring.length,
      open_incidents: incidents.data?.length ?? 0,
    },
  };
}

export const getExchangeValidationTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return runValidationSnapshot();
  });

export const runExchangeValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const validation = await runValidationSnapshot();
    const failCount = validation.checks.filter((check) => check.status === "fail").length;
    const warningCount = validation.checks.filter((check) => check.status === "warning").length;
    const severity = failCount > 0 ? "critical" : warningCount > 0 ? "warning" : "info";

    await monitoringEngine.recordMonitoringEvent({
      service: "exchange-validation",
      eventType: "validation.run",
      severity,
      status: validation.overall_status,
      message: `${validation.failing} failures and ${validation.warnings} warnings reported in exchange validation`,
      metricName: "validation_summary",
      metricValue: validation.failing,
      metadata: {
        ts: validation.ts,
        runtime_ms: validation.runtime_ms,
        metrics: validation.metrics,
      },
    });

    return validation;
  });
