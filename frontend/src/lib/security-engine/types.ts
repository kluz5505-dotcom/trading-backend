export interface SecurityEventRecord {
  id: string;
  user_id: string | null;
  session_id: string | null;
  event_type: string;
  severity: "info" | "warning" | "high" | "critical";
  risk_score: number;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export interface FraudFlagRecord {
  id: string;
  security_event_id: string | null;
  user_id: string | null;
  flag_type: string;
  severity: "warning" | "high" | "critical";
  confidence: number;
  status: "open" | "reviewed" | "cleared" | "dismissed";
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}
