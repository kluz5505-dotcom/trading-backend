import type { Database } from "@/integrations/supabase/types";

export type WithdrawalStatus = Database["public"]["Enums"]["withdrawal_status"];
export type WithdrawalFilter = "pending" | "approved" | "rejected" | "held";
export type WithdrawalDecision = "approved" | "rejected" | "hold";

export type WithdrawalDashboardItem = Database["public"]["Tables"]["withdrawals"]["Row"] & {
  display_status: "pending" | "approved" | "rejected" | "held";
  user_email: string | null;
  user_display_name: string | null;
  user_status: Database["public"]["Enums"]["account_status"] | null;
  withdrawals_frozen: boolean;
  assigned_wallet_address: string | null;
  latest_login_at: string | null;
  risk_flags: string[];
  large_withdrawal_alert: boolean;
}

export interface WithdrawalDetailRecord {
  withdrawal: Database["public"]["Tables"]["withdrawals"]["Row"];
  user_profile: Database["public"]["Tables"]["profiles"]["Row"] | null;
  assigned_wallet: Database["public"]["Tables"]["wallet_addresses"]["Row"] | null;
  withdrawal_transactions: Database["public"]["Tables"]["transactions"]["Row"][];
  session_history: Array<Database["public"]["Tables"]["login_history"]["Row"] & {
    ip_address: string | null;
  }>;
  audit_entries: Array<Database["public"]["Tables"]["audit_logs"]["Row"] & {
    ip_address: string | null;
  }>;
}
