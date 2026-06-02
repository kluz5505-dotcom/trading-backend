import type { Database } from "@/integrations/supabase/types";

export type DepositStatus = "pending" | "approved" | "rejected" | "hold";
export type DepositFilter = "pending" | "approved" | "rejected" | "held";
export type DepositDecision = "approved" | "rejected" | "hold";

export type DepositDashboardItem = Database["public"]["Tables"]["deposits"]["Row"] & {
  display_status: "pending" | "approved" | "rejected" | "held";
  user_email: string | null;
  user_display_name: string | null;
  user_status: Database["public"]["Enums"]["account_status"] | null;
  assigned_wallet_address: string | null;
  latest_login_at: string | null;
}

export interface DepositDetailRecord {
  deposit: Database["public"]["Tables"]["deposits"]["Row"];
  user_profile: Database["public"]["Tables"]["profiles"]["Row"] | null;
  assigned_wallet: Database["public"]["Tables"]["wallet_addresses"]["Row"] | null;
  deposit_transactions: Database["public"]["Tables"]["transactions"]["Row"][];
  recent_login_history: Array<Database["public"]["Tables"]["login_history"]["Row"] & {
    ip_address: string | null;
  }>;
  audit_entries: Array<Database["public"]["Tables"]["audit_logs"]["Row"] & {
    ip_address: string | null;
  }>;
}
