import type { Database } from "@/integrations/supabase/types";

export type UserRole = Database["public"]["Enums"]["app_role"];
export type AccountStatus = Database["public"]["Enums"]["account_status"];
export type KycLevel = Database["public"]["Enums"]["kyc_level"];
export type NetworkType = Database["public"]["Enums"]["network_type"];

export interface UserManagementSnapshot {
  id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  status: AccountStatus;
  kyc_level: KycLevel;
  trading_frozen: boolean;
  withdrawals_frozen: boolean;
  roles: UserRole[];
  total_available: number;
  total_locked: number;
  wallet_count: number;
  last_login_at: string | null;
}

export interface UserManagementDetail {
  profile: Database["public"]["Tables"]["profiles"]["Row"];
  roles: Database["public"]["Tables"]["user_roles"]["Row"][];
  balances: Database["public"]["Tables"]["balances"]["Row"][];
  wallet_addresses: Database["public"]["Tables"]["wallet_addresses"]["Row"][];
  login_history: Array<Database["public"]["Tables"]["login_history"]["Row"] & {
    ip_address: string | null;
  }>;
  transactions: Database["public"]["Tables"]["transactions"]["Row"][];
  deposits: Database["public"]["Tables"]["deposits"]["Row"][];
  withdrawals: Database["public"]["Tables"]["withdrawals"]["Row"][];
  kyc_submissions: Database["public"]["Tables"]["kyc_submissions"]["Row"][];
  audit_logs: Array<Database["public"]["Tables"]["audit_logs"]["Row"] & {
    ip_address: string | null;
  }>;
}
