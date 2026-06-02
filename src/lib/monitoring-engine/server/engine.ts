import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

export class MonitoringEngine {
  async recordMonitoringEvent(params: {
    service: string;
    eventType: string;
    severity?: "info" | "warning" | "critical";
    status: string;
    message: string;
    metricName?: string | null;
    metricValue?: number | null;
    metadata?: Record<string, unknown>;
  }) {
    const { data, error } = await supabaseAdmin
      .from("monitoring_events")
      .insert({
        service: params.service,
        event_type: params.eventType,
        severity: params.severity ?? "info",
        status: params.status,
        message: params.message,
        metric_name: params.metricName ?? null,
        metric_value: params.metricValue ?? null,
        metadata: (params.metadata ?? {}) as unknown as Json,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async createAlertRule(params: {
    name: string;
    service: string;
    metricName: string;
    threshold: number;
    comparison: string;
    severity?: "info" | "warning" | "critical";
    enabled?: boolean;
    cooldownSeconds?: number;
    metadata?: Record<string, unknown>;
  }) {
    const { data, error } = await supabaseAdmin
      .from("alert_rules")
      .insert({
        name: params.name,
        service: params.service,
        metric_name: params.metricName,
        threshold: params.threshold,
        comparison: params.comparison,
        severity: params.severity ?? "warning",
        enabled: params.enabled ?? true,
        cooldown_seconds: params.cooldownSeconds ?? 300,
        metadata: (params.metadata ?? {}) as unknown as Json,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async evaluateAlertRules() {
    const { data: rules, error: rulesError } = await supabaseAdmin
      .from("alert_rules")
      .select("*")
      .eq("enabled", true);
    if (rulesError) throw new Error(rulesError.message);

    const now = new Date();
    const alerts: Array<Record<string, unknown>> = [];

    for (const rule of rules ?? []) {
      const { data: metrics } = await supabaseAdmin
        .from("monitoring_events")
        .select("metric_value, created_at")
        .eq("service", rule.service)
        .eq("metric_name", rule.metric_name)
        .order("created_at", { ascending: false })
        .limit(100);

      const latest = metrics?.[0];
      if (!latest) continue;

      const value = Number(latest.metric_value ?? 0);
      const threshold = Number(rule.threshold ?? 0);
      const breached = rule.comparison === ">" ? value > threshold : value < threshold;

      if (breached) {
        const cooldownMs = Number(rule.cooldown_seconds ?? 300) * 1000;
        const recent = await supabaseAdmin
          .from("monitoring_events")
          .select("id")
          .eq("service", rule.service)
          .eq("event_type", `alert:${rule.name}`)
          .gte("created_at", new Date(now.getTime() - cooldownMs).toISOString())
          .limit(1);

        if (recent.data && recent.data.length === 0) {
          const record = await this.recordMonitoringEvent({
            service: rule.service,
            eventType: `alert:${rule.name}`,
            severity: rule.severity as "info" | "warning" | "critical",
            status: "open",
            message: `Alert rule ${rule.name} breached with value ${value} against threshold ${threshold}`,
            metricName: rule.metric_name,
            metricValue: value,
            metadata: { rule_id: rule.id, comparison: rule.comparison, threshold },
          });
          alerts.push(record);
        }
      }
    }

    return alerts;
  }

  async createIncident(params: {
    title: string;
    service: string;
    severity?: "info" | "warning" | "critical";
    status?: string;
    description: string;
    metadata?: Record<string, unknown>;
  }) {
    const { data, error } = await supabaseAdmin
      .from("incidents")
      .insert({
        title: params.title,
        service: params.service,
        severity: params.severity ?? "warning",
        status: params.status ?? "open",
        description: params.description,
        metadata: (params.metadata ?? {}) as unknown as Json,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async resolveIncident(incidentId: string, resolvedBy: string) {
    const { data, error } = await supabaseAdmin
      .from("incidents")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("id", incidentId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getPlatformHealth() {
    const [serviceRows, incidentRows, monitoringRows] = await Promise.all([
      supabaseAdmin.from("monitoring_events").select("service, severity, status, metric_value").gte("created_at", new Date(Date.now() - 3600000).toISOString()),
      supabaseAdmin.from("incidents").select("*").eq("status", "open"),
      supabaseAdmin.from("monitoring_events").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 3600000).toISOString()),
    ]);

    if (serviceRows.error) throw new Error(serviceRows.error.message);
    if (incidentRows.error) throw new Error(incidentRows.error.message);
    if (monitoringRows.error) throw new Error(monitoringRows.error.message);

    const services = new Set((serviceRows.data ?? []).map((row) => row.service));
    const warningCount = (serviceRows.data ?? []).filter((row) => row.severity === "warning" || row.severity === "critical").length;

    return {
      monitored_services: services.size,
      open_incidents: incidentRows.data?.length ?? 0,
      monitoring_events_last_hour: monitoringRows.count ?? 0,
      warning_events_last_hour: warningCount,
      healthy: (incidentRows.data?.length ?? 0) === 0,
    };
  }
}

export const monitoringEngine = new MonitoringEngine();
