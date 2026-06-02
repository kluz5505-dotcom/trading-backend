export type TreasuryWalletType = "hot" | "cold";
export type TreasuryWalletStatus = "active" | "quarantined" | "offline";

export interface TreasuryWalletRecord {
  id: string;
  wallet_type: TreasuryWalletType;
  asset: string;
  address: string;
  label: string | null;
  status: TreasuryWalletStatus;
  balance: number;
  available_balance: number;
  reserved_balance: number;
  min_balance: number;
  max_balance: number | null;
  last_synced_at: string | null;
  risk_score: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ReserveSnapshotRecord {
  id: string;
  snapshot_time: string;
  hot_balance: number;
  cold_balance: number;
  total_reserve: number;
  liabilities: number;
  net_treasury: number;
  exposure: number;
  source: string;
  metrics: Record<string, unknown>;
  generated_at: string;
}

export interface TreasuryTransferRecord {
  id: string;
  from_wallet_id: string | null;
  to_wallet_id: string | null;
  asset: string;
  amount: number;
  transfer_type: string;
  status: string;
  initiated_by: string | null;
  completed_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
