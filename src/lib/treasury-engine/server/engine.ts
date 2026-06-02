import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

interface WalletAggregate {
  hot_balance: number;
  cold_balance: number;
  available: number;
  reserved: number;
}

export class TreasuryEngine {
  async upsertWallet(wallet: {
    walletType: "hot" | "cold";
    asset: string;
    address: string;
    label?: string | null;
    status?: "active" | "quarantined" | "offline";
    balance?: number;
    availableBalance?: number;
    reservedBalance?: number;
    minBalance?: number;
    maxBalance?: number | null;
    metadata?: Record<string, unknown>;
  }) {
    const { data, error } = await supabaseAdmin
      .from("treasury_wallets")
      .upsert(
        {
          wallet_type: wallet.walletType,
          asset: wallet.asset,
          address: wallet.address,
          label: wallet.label ?? null,
          status: wallet.status ?? "active",
          balance: wallet.balance ?? 0,
          available_balance: wallet.availableBalance ?? wallet.balance ?? 0,
          reserved_balance: wallet.reservedBalance ?? 0,
          min_balance: wallet.minBalance ?? 0,
          max_balance: wallet.maxBalance ?? null,
          metadata: (wallet.metadata ?? {}) as unknown as Json,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "wallet_type,asset,address" }
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async syncWalletBalance(walletId: string, balance: number, availableBalance: number, reservedBalance: number) {
    const { data, error } = await supabaseAdmin
      .from("treasury_wallets")
      .update({
        balance,
        available_balance: availableBalance,
        reserved_balance: reservedBalance,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", walletId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getTreasurySummary() {
    const [walletRows, liabilitiesRows, transferRows] = await Promise.all([
      supabaseAdmin.from("treasury_wallets").select("*").order("wallet_type", { ascending: true }),
      supabaseAdmin.from("withdrawals").select("amount, fee").eq("status", "pending"),
      supabaseAdmin.from("futures_positions").select("margin_allocated, quantity, current_price"),
    ]);

    if (walletRows.error) throw new Error(walletRows.error.message);
    if (liabilitiesRows.error) throw new Error(liabilitiesRows.error.message);
    if (transferRows.error) throw new Error(transferRows.error.message);

    const aggregate = (walletRows.data ?? []).reduce<WalletAggregate>((acc, row) => {
      const balance = Number(row.balance ?? 0);
      if (row.wallet_type === "hot") {
        acc.hot_balance += balance;
      } else {
        acc.cold_balance += balance;
      }
      acc.available += Number(row.available_balance ?? 0);
      acc.reserved += Number(row.reserved_balance ?? 0);
      return acc;
    }, { hot_balance: 0, cold_balance: 0, available: 0, reserved: 0 });

    const pendingWithdrawals = (liabilitiesRows.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0) + Number(row.fee ?? 0), 0);
    const futuresLiabilities = (transferRows.data ?? []).reduce((sum, row) => sum + Number(row.margin_allocated ?? 0), 0);
    const totalLiabilities = pendingWithdrawals + futuresLiabilities;
    const totalReserve = aggregate.hot_balance + aggregate.cold_balance;

    return {
      hot_balance: aggregate.hot_balance,
      cold_balance: aggregate.cold_balance,
      total_reserve: totalReserve,
      available_balance: aggregate.available,
      reserved_balance: aggregate.reserved,
      liabilities: totalLiabilities,
      net_treasury: totalReserve - totalLiabilities,
      exposure: totalLiabilities,
      wallet_count: walletRows.data?.length ?? 0,
      pending_withdrawals: pendingWithdrawals,
      futures_liabilities: futuresLiabilities,
    };
  }

  async createReserveSnapshot() {
    const summary = await this.getTreasurySummary();
    const { data, error } = await supabaseAdmin
      .from("reserve_snapshots")
      .insert({
        snapshot_time: new Date().toISOString(),
        hot_balance: summary.hot_balance,
        cold_balance: summary.cold_balance,
        total_reserve: summary.total_reserve,
        liabilities: summary.liabilities,
        net_treasury: summary.net_treasury,
        exposure: summary.exposure,
        source: "system",
        metrics: summary,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async executeInternalTransfer(actorId: string, input: {
    fromWalletId: string;
    toWalletId: string;
    asset: string;
    amount: number;
    transferType?: string;
    notes?: string | null;
  }) {
    const { data: fromWallet, error: fromErr } = await supabaseAdmin.from("treasury_wallets").select("*").eq("id", input.fromWalletId).single();
    if (fromErr || !fromWallet) throw new Error("Source wallet not found");
    const { data: toWallet, error: toErr } = await supabaseAdmin.from("treasury_wallets").select("*").eq("id", input.toWalletId).single();
    if (toErr || !toWallet) throw new Error("Destination wallet not found");
    if (Number(fromWallet.available_balance ?? 0) < input.amount) throw new Error("Insufficient treasury balance");

    const transfer = await supabaseAdmin
      .from("treasury_transfers")
      .insert({
        from_wallet_id: input.fromWalletId,
        to_wallet_id: input.toWalletId,
        asset: input.asset,
        amount: input.amount,
        transfer_type: input.transferType ?? "internal",
        status: "pending",
        initiated_by: actorId,
        notes: input.notes ?? null,
        metadata: { from_wallet: fromWallet.label, to_wallet: toWallet.label },
      })
      .select("*")
      .single();
    if (transfer.error || !transfer.data) throw new Error(transfer.error?.message ?? "Failed to create treasury transfer");

    const fromAvailable = Number(fromWallet.available_balance) - input.amount;
    const fromReserved = Number(fromWallet.reserved_balance) + input.amount;
    const fromBalance = fromAvailable + fromReserved;

    await supabaseAdmin.from("treasury_wallets").update({
      balance: fromBalance,
      available_balance: fromAvailable,
      reserved_balance: fromReserved,
      updated_at: new Date().toISOString(),
    }).eq("id", input.fromWalletId);

    const toAvailable = Number(toWallet.available_balance) + input.amount;
    const toBalance = Number(toWallet.balance ?? 0) + input.amount;

    await supabaseAdmin.from("treasury_wallets").update({
      balance: toBalance,
      available_balance: toAvailable,
      updated_at: new Date().toISOString(),
    }).eq("id", input.toWalletId);

    await supabaseAdmin.from("treasury_transfers").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", transfer.data.id);

    await supabaseAdmin.from("transactions").insert({
      user_id: actorId,
      asset: input.asset,
      type: "transfer",
      amount: -input.amount,
      balance_after: Number(fromWallet.available_balance) - input.amount,
      reference_id: transfer.data.id,
      reference_type: "treasury_transfer",
      note: `Internal treasury transfer ${input.amount} ${input.asset}`,
    });

    return transfer.data;
  }

  async getReserveAlerts() {
    const { data, error } = await supabaseAdmin
      .from("treasury_wallets")
      .select("*")
      .lt("available_balance", "min_balance");
    if (error) throw new Error(error.message);
    return data ?? [];
  }
}

export const treasuryEngine = new TreasuryEngine();
