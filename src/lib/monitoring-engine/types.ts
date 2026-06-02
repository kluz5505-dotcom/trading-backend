export type MonitoringSeverity = "info" | "warning" | "critical";

export interface MonitoringEventRecord {
  id: string;
  service: string;
  event_type: string;
  severity: MonitoringSeverity;
  status: string;
  message: string;
  metric_name: string | null;
  metric_value: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export interface AlertRuleRecord {
  id: string;
  name: string;
  service: string;
  metric_name: string;
  threshold: number;
  comparison: string;
  severity: MonitoringSeverity;
  enabled: boolean;
  cooldown_seconds: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface IncidentRecord {
  id: string;
  title: string;
  service: string;
  severity: MonitoringSeverity;
  status: string;
  acknowledged_by: string | null;
  resolved_by: string | null;
  started_at: string;
  resolved_at: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
