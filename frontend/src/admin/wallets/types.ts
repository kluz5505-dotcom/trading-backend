import type { Database } from "@/integrations/supabase/types";

export type WalletState = "enabled" | "disabled";
export type WalletControlAction =
  | "create"
  | "assign-user"
  | "edit-address"
  | "enable"
  | "disable"
  | "freeze"
  | "unfreeze"
  | "adjust-balance"
  | "lock-balance"
  | "unlock-balance"
  | "internal-transfer";

export interface WalletStateMetadata {
  enabled: boolean;
  frozen: boolean;
  status: WalletState;
  userMemo: string | null;
}

export type WalletDashboardItem = Database["public"]["Tables"]["wallet_addresses"]["Row"] & {
  wallet_status: WalletState;
  wallet_enabled: boolean;
  wallet_frozen: boolean;
  available_balance: number;
  locked_balance: number;
  total_balance: number;
  user_email: string | null;
  user_display_name: string | null;
  user_status: Database["public"]["Enums"]["account_status"] | null;
  user_trading_frozen: boolean;
  user_withdrawals_frozen: boolean;
  recent_activity_count: number;
  recent_deposit_count_24h: number;
  recent_withdrawal_count_24h: number;
}

export interface WalletDetailRecord {
  wallet: Database["public"]["Tables"]["wallet_addresses"]["Row"];
  wallet_state: WalletStateMetadata;
  user_profile: Database["public"]["Tables"]["profiles"]["Row"] | null;
  balance: Database["public"]["Tables"]["balances"]["Row"] | null;
  transactions: Database["public"]["Tables"]["transactions"]["Row"][];
  deposit_activity: Database["public"]["Tables"]["deposits"]["Row"][];
  withdrawal_activity: Database["public"]["Tables"]["withdrawals"]["Row"][];
  audit_entries: Database["public"]["Tables"]["audit_logs"]["Row"][];
}

export interface TreasurySnapshot {
  total_wallet_balance: number;
  total_locked_liabilities: number;
  total_reserves: number;
  pending_withdrawal_liability: number;
  active_wallets: number;
  total_wallets: number;
  recent_transactions_24h: number;
  recent_internal_transfers_24h: number;
  recent_deposits_24h: number;
  recent_withdrawals_24h: number;
}
