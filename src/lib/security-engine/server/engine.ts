import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

export class SecurityEngine {
  async recordSecurityEvent(params: {
    userId?: string | null;
    sessionId?: string | null;
    eventType: string;
    severity?: "info" | "warning" | "high" | "critical";
    riskScore?: number;
    ipAddress?: string | null;
    userAgent?: string | null;
    details?: Record<string, unknown>;
  }) {
    const { data, error } = await supabaseAdmin
      .from("security_events")
      .insert({
        user_id: params.userId ?? null,
        session_id: params.sessionId ?? null,
        event_type: params.eventType,
        severity: params.severity ?? "info",
        risk_score: params.riskScore ?? 0,
        ip_address: params.ipAddress ?? null,
        user_agent: params.userAgent ?? null,
        details: (params.details ?? {}) as unknown as Json,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async createFraudFlag(params: {
    userId?: string | null;
    securityEventId?: string | null;
    flagType: string;
    severity?: "info" | "warning" | "high" | "critical";
    confidence?: number;
    notes?: string | null;
    assignedTo?: string | null;
  }) {
    const { data, error } = await supabaseAdmin
      .from("fraud_flags")
      .insert({
        security_event_id: params.securityEventId ?? null,
        user_id: params.userId ?? null,
        flag_type: params.flagType,
        severity: params.severity ?? "warning",
        confidence: params.confidence ?? 0,
        notes: params.notes ?? null,
        assigned_to: params.assignedTo ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async evaluateWithdrawalRisk(params: {
    userId: string;
    withdrawalId: string;
    asset: string;
    amount: number;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const [profileResult, recentWithdrawalsResult, loginHistoryResult, orderHistoryResult] = await Promise.all([
      supabaseAdmin.from("profiles").select("status, withdrawals_frozen").eq("id", params.userId).single(),
      supabaseAdmin.from("withdrawals").select("id, amount, created_at").eq("user_id", params.userId).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      supabaseAdmin.from("login_history").select("ip_address, created_at").eq("user_id", params.userId).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("orders").select("id").eq("user_id", params.userId).gte("placed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    if (recentWithdrawalsResult.error) throw new Error(recentWithdrawalsResult.error.message);
    if (loginHistoryResult.error) throw new Error(loginHistoryResult.error.message);
    if (orderHistoryResult.error) throw new Error(orderHistoryResult.error.message);

    const profile = profileResult.data;
    const recentCount = (recentWithdrawalsResult.data ?? []).length;
    const uniqueIPs = new Set((loginHistoryResult.data ?? []).map((row) => String(row.ip_address ?? "")).filter(Boolean));
    const orderCount = (orderHistoryResult.data ?? []).length;

    let riskScore = 0;
    let severity: "info" | "warning" | "high" | "critical" = "info";

    if (params.amount >= 10000) riskScore += 25;
    if (recentCount >= 3) riskScore += 20;
    if (uniqueIPs.size >= 3) riskScore += 25;
    if (orderCount >= 20) riskScore += 10;
    if (profile?.withdrawals_frozen) riskScore += 30;
    if (profile?.status === "frozen") riskScore += 35;

    if (riskScore >= 60) severity = "critical";
    else if (riskScore >= 35) severity = "high";
    else if (riskScore >= 15) severity = "warning";

    const event = await this.recordSecurityEvent({
      userId: params.userId,
      eventType: "withdrawal_risk_assessment",
      severity,
      riskScore,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      details: {
        withdrawal_id: params.withdrawalId,
        asset: params.asset,
        amount: params.amount,
        recent_withdrawal_count: recentCount,
        unique_ip_count: uniqueIPs.size,
        trading_order_count: orderCount,
      },
    });

    if (riskScore >= 35) {
      await this.createFraudFlag({
        userId: params.userId,
        securityEventId: event.id,
        flagType: "withdrawal_risk",
        severity: severity === "critical" ? "critical" : "high",
        confidence: Math.min(riskScore / 100, 1),
        notes: `Automated withdrawal risk score ${riskScore} for withdrawal ${params.withdrawalId}`,
      });
    }

    return {
      event,
      riskScore,
      severity,
      flagged: riskScore >= 35,
    };
  }

  async detectSuspiciousLogin(params: {
    userId: string;
    sessionId?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const { data, error } = await supabaseAdmin
      .from("login_history")
      .select("ip_address, created_at")
      .eq("user_id", params.userId)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    const distinctIPs = new Set((data ?? []).map((entry) => String(entry.ip_address ?? "")).filter(Boolean));
    const riskScore = distinctIPs.size >= 4 ? 40 : distinctIPs.size >= 3 ? 25 : 0;
    const severity: "info" | "warning" | "high" | "critical" = riskScore >= 40 ? "high" : riskScore >= 25 ? "warning" : "info";

    if (riskScore === 0) return { riskScore, severity, flagged: false };

    const event = await this.recordSecurityEvent({
      userId: params.userId,
      sessionId: params.sessionId ?? null,
      eventType: "suspicious_login",
      severity,
      riskScore,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      details: {
        distinct_ip_count: distinctIPs.size,
        recent_logins: data?.length ?? 0,
      },
    });

    await this.createFraudFlag({
      userId: params.userId,
      securityEventId: event.id,
      flagType: "multi_ip_login",
      severity,
      confidence: riskScore / 100,
      notes: `Multiple distinct IP addresses detected in recent login history`,
    });

    return { riskScore, severity, flagged: true, event };
  }

  async detectAbnormalTrading(params: {
    userId: string;
    symbol?: string;
  }) {
    const start = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [spotResult, futuresResult] = await Promise.all([
      supabaseAdmin.from("orders").select("id").eq("user_id", params.userId).gte("placed_at", start),
      supabaseAdmin.from("futures_orders").select("id").eq("user_id", params.userId).gte("placed_at", start),
    ]);

    if (spotResult.error) throw new Error(spotResult.error.message);
    if (futuresResult.error) throw new Error(futuresResult.error.message);

    const spotCount = (spotResult.data ?? []).length;
    const futuresCount = (futuresResult.data ?? []).length;
    const total = spotCount + futuresCount;
    const riskScore = total >= 40 ? 45 : total >= 25 ? 30 : 0;

    if (riskScore === 0) return { riskScore, severity: "info", flagged: false };

    const severity: "info" | "warning" | "high" | "critical" = riskScore >= 45 ? "high" : "warning";
    const event = await this.recordSecurityEvent({
      userId: params.userId,
      eventType: "abnormal_trading_activity",
      severity,
      riskScore,
      details: {
        spot_orders: spotCount,
        futures_orders: futuresCount,
        symbol: params.symbol ?? null,
      },
    });

    await this.createFraudFlag({
      userId: params.userId,
      securityEventId: event.id,
      flagType: "abnormal_trading",
      severity,
      confidence: riskScore / 100,
      notes: `High-frequency trading activity detected in rolling window`,
    });

    return { riskScore, severity, flagged: true, event };
  }

  async scanPlatform() {
    const [securityCount, fraudCount, monitoringCount] = await Promise.all([
      supabaseAdmin.from("security_events").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()),
      supabaseAdmin.from("fraud_flags").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.from("monitoring_events").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()),
    ]);

    return {
      security_events_last_hour: securityCount.count ?? 0,
      open_fraud_flags: fraudCount.count ?? 0,
      monitoring_events_last_hour: monitoringCount.count ?? 0,
    };
  }
}

export const securityEngine = new SecurityEngine();
