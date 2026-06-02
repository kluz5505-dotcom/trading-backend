import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { TreasurySnapshot, WalletDashboardItem, WalletDetailRecord, WalletStateMetadata } from "./types";

const BALANCE_EDITOR_ROLES = new Set(["super_admin", "finance_admin"]);

function normalizeWalletState(memo: string | null): WalletStateMetadata {
  const defaultState: WalletStateMetadata = {
    enabled: true,
    frozen: false,
    status: "enabled",
    userMemo: null,
  };

  if (!memo) return defaultState;

  try {
    const parsed = JSON.parse(memo) as Partial<WalletStateMetadata> & {
      memo?: string | null;
      userMemo?: string | null;
    };

    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true,
      frozen: typeof parsed.frozen === "boolean" ? parsed.frozen : false,
      status: typeof parsed.enabled === "boolean" && !parsed.enabled ? "disabled" : "enabled",
      userMemo: typeof parsed.userMemo === "string" ? parsed.userMemo : typeof parsed.memo === "string" ? parsed.memo : null,
    };
  } catch {
    return {
      ...defaultState,
      userMemo: memo,
    };
  }
}

function serializeWalletState(existingMemo: string | null, patch: Partial<WalletStateMetadata>) {
  const parsed = normalizeWalletState(existingMemo);
  const next: Record<string, unknown> = {
    enabled: patch.enabled ?? parsed.enabled,
    frozen: patch.frozen ?? parsed.frozen,
    status: patch.enabled === false ? "disabled" : "enabled",
    userMemo: patch.userMemo ?? parsed.userMemo,
  };

  return JSON.stringify(next);
}

async function writeAudit(actorId: string, actorEmail: string | undefined, action: string, targetType: string, targetId: string, details: Record<string, unknown>) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    actor_email: actorEmail ?? null,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details as never,
  });
}

async function assertBalanceEditor(context: { userId: string; claims: Record<string, unknown> }) {
  const metadataRole = String(
    (context.claims.app_metadata as Record<string, unknown> | undefined)?.role ??
      (context.claims.user_metadata as Record<string, unknown> | undefined)?.role ??
      "",
  ).toLowerCase();

  if (BALANCE_EDITOR_ROLES.has(metadataRole)) {
    return { role: metadataRole as "super_admin" | "finance_admin" };
  }

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .in("role", Array.from(BALANCE_EDITOR_ROLES) as any)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: finance_admin or super_admin required");

  return { role: data.role as "super_admin" | "finance_admin" };
}

function createTransferReference() {
  return `wallet-transfer-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function buildDashboardItem(
  wallet: Database["public"]["Tables"]["wallet_addresses"]["Row"],
  profile: Database["public"]["Tables"]["profiles"]["Row"] | undefined,
  balance: Database["public"]["Tables"]["balances"]["Row"] | undefined,
  txns: Database["public"]["Tables"]["transactions"]["Row"][],
  deposits: Database["public"]["Tables"]["deposits"]["Row"][],
  withdrawals: Database["public"]["Tables"]["withdrawals"]["Row"][],
): WalletDashboardItem {
  const state = normalizeWalletState(wallet.memo);
  const available = Number(balance?.available ?? 0);
  const locked = Number(balance?.locked ?? 0);
  const total = available + locked;
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const recentActivity = txns.filter((entry) => entry.user_id === wallet.user_id && entry.asset === wallet.asset && entry.created_at >= dayAgo);
  const recentDeposits = deposits.filter((entry) => entry.user_id === wallet.user_id && entry.asset === wallet.asset && entry.created_at >= dayAgo);
  const recentWithdrawals = withdrawals.filter((entry) => entry.user_id === wallet.user_id && entry.asset === wallet.asset && entry.created_at >= dayAgo);

  return {
    ...wallet,
    wallet_status: state.status,
    wallet_enabled: state.enabled,
    wallet_frozen: state.frozen,
    available_balance: available,
    locked_balance: locked,
    total_balance: total,
    user_email: profile?.email ?? null,
    user_display_name: profile?.display_name ?? null,
    user_status: profile?.status ?? null,
    user_trading_frozen: profile?.trading_frozen ?? false,
    user_withdrawals_frozen: profile?.withdrawals_frozen ?? false,
    recent_activity_count: recentActivity.length,
    recent_deposit_count_24h: recentDeposits.length,
    recent_withdrawal_count_24h: recentWithdrawals.length,
  };
}

export const listWalletDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    search: z.string().max(200).optional().default(""),
    asset: z.string().max(20).optional().nullable(),
    network: z.string().max(30).optional().nullable(),
    user: z.string().max(200).optional().nullable(),
    enabled: z.boolean().optional().nullable(),
    limit: z.number().int().min(20).max(500).optional().default(250),
    offset: z.number().int().min(0).optional().default(0),
  }).parse(input))
  .handler(async ({ data }) => {
    const [walletResult, profileResult, balanceResult, transactionResult, depositResult, withdrawalResult] = await Promise.all([
      supabaseAdmin
        .from("wallet_addresses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(data.limit)
        .range(data.offset, data.offset + data.limit - 1),
      supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("balances").select("*").order("updated_at", { ascending: false }),
      supabaseAdmin.from("transactions").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("deposits").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("withdrawals").select("*").order("created_at", { ascending: false }),
    ]);

    if (walletResult.error) throw new Error(walletResult.error.message);
    if (profileResult.error) throw new Error(profileResult.error.message);
    if (balanceResult.error) throw new Error(balanceResult.error.message);
    if (transactionResult.error) throw new Error(transactionResult.error.message);
    if (depositResult.error) throw new Error(depositResult.error.message);
    if (withdrawalResult.error) throw new Error(withdrawalResult.error.message);

    const profilesByUser = new Map<string, Database["public"]["Tables"]["profiles"]["Row"]>();
    (profileResult.data ?? []).forEach((profile) => profilesByUser.set(profile.id, profile));

    const balancesByKey = new Map<string, Database["public"]["Tables"]["balances"]["Row"]>();
    (balanceResult.data ?? []).forEach((balance) => {
      balancesByKey.set(`${balance.user_id}:${balance.asset}`, balance);
    });

    const search = data.search.trim().toLowerCase();
    const filtered = (walletResult.data ?? []).filter((wallet) => {
      if (data.asset && wallet.asset !== data.asset) return false;
      if (data.network && wallet.network !== data.network) return false;
      if (data.enabled !== null && data.enabled !== undefined) {
        const state = normalizeWalletState(wallet.memo);
        if (state.enabled !== data.enabled) return false;
      }

      if (search) {
        const profile = profilesByUser.get(wallet.user_id);
        const haystack = [
          wallet.id,
          wallet.address,
          wallet.asset,
          wallet.network,
          wallet.user_id,
          profile?.email,
          profile?.display_name,
          profile?.status,
        ].filter(Boolean).join(" ").toLowerCase();

        if (!haystack.includes(search)) return false;
      }

      if (data.user) {
        const profile = profilesByUser.get(wallet.user_id);
        const matches = [wallet.user_id, profile?.email, profile?.display_name].filter((value) => value?.toLowerCase().includes(data.user!.toLowerCase()));
        if (!matches.length) return false;
      }

      return true;
    });

    return filtered.map((wallet) => buildDashboardItem(
      wallet,
      profilesByUser.get(wallet.user_id),
      balancesByKey.get(`${wallet.user_id}:${wallet.asset}`),
      transactionResult.data ?? [],
      depositResult.data ?? [],
      withdrawalResult.data ?? [],
    ));
  });

export const getWalletDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ wallet_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallet_addresses")
      .select("*")
      .eq("id", data.wallet_id)
      .single();

    if (walletError) throw new Error(walletError.message);
    if (!wallet) throw new Error("Wallet not found");

    const [profileResult, balanceResult, transactionResult, depositResult, withdrawalResult, auditResult] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", wallet.user_id).maybeSingle(),
      supabaseAdmin.from("balances").select("*").eq("user_id", wallet.user_id).eq("asset", wallet.asset).maybeSingle(),
      supabaseAdmin.from("transactions").select("*").eq("user_id", wallet.user_id).eq("asset", wallet.asset).order("created_at", { ascending: false }).limit(250),
      supabaseAdmin.from("deposits").select("*").eq("user_id", wallet.user_id).eq("asset", wallet.asset).order("created_at", { ascending: false }).limit(250),
      supabaseAdmin.from("withdrawals").select("*").eq("user_id", wallet.user_id).eq("asset", wallet.asset).order("created_at", { ascending: false }).limit(250),
      supabaseAdmin.from("audit_logs").select("*").eq("target_id", wallet.id).order("created_at", { ascending: false }).limit(250),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    if (balanceResult.error) throw new Error(balanceResult.error.message);
    if (transactionResult.error) throw new Error(transactionResult.error.message);
    if (depositResult.error) throw new Error(depositResult.error.message);
    if (withdrawalResult.error) throw new Error(withdrawalResult.error.message);
    if (auditResult.error) throw new Error(auditResult.error.message);

    const detail: WalletDetailRecord = {
      wallet,
      wallet_state: normalizeWalletState(wallet.memo),
      user_profile: profileResult.data ?? null,
      balance: balanceResult.data ?? null,
      transactions: transactionResult.data ?? [],
      deposit_activity: depositResult.data ?? [],
      withdrawal_activity: withdrawalResult.data ?? [],
      audit_entries: auditResult.data ?? [],
    };

    return detail;
  });

export const createWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    asset: z.string().min(2).max(20),
    network: z.string().min(2).max(30),
    address: z.string().min(10).max(200),
    memo: z.string().max(500).optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("*").eq("id", data.user_id).maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("User profile not found");

    const walletMemo = serializeWalletState(null, { enabled: true, frozen: false, userMemo: data.memo ?? null });

    const { data: wallet, error: walletError } = await supabaseAdmin.from("wallet_addresses").insert({
      user_id: data.user_id,
      asset: data.asset,
      network: data.network as Database["public"]["Enums"]["network_type"],
      address: data.address,
      memo: walletMemo,
      assigned_by: context.userId,
    }).select("*").single();

    if (walletError) throw new Error(walletError.message);
    if (!wallet) throw new Error("Wallet creation failed");

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      "wallet.create",
      "wallet",
      wallet.id,
      {
        user_id: data.user_id,
        asset: data.asset,
        network: data.network,
        address: data.address,
      },
    );

    return wallet;
  });

export const assignWalletToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    wallet_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("*").eq("id", data.user_id).maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("User profile not found");

    const { data: existingWallet, error: existingWalletError } = await supabaseAdmin
      .from("wallet_addresses")
      .select("*")
      .eq("id", data.wallet_id)
      .single();

    if (existingWalletError) throw new Error(existingWalletError.message);
    if (!existingWallet) throw new Error("Wallet not found");

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallet_addresses")
      .update({
        user_id: data.user_id,
        assigned_by: context.userId,
      })
      .eq("id", data.wallet_id)
      .select("*")
      .single();

    if (walletError) throw new Error(walletError.message);
    if (!wallet) throw new Error("Wallet update failed");

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      "wallet.assign_user",
      "wallet",
      wallet.id,
      {
        user_id: data.user_id,
        previous_owner: existingWallet.user_id,
        wallet_id: wallet.id,
      },
    );

    return wallet;
  });

export const editWalletAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    wallet_id: z.string().uuid(),
    address: z.string().min(10).max(200),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallet_addresses")
      .update({ address: data.address })
      .eq("id", data.wallet_id)
      .select("*")
      .single();

    if (walletError) throw new Error(walletError.message);
    if (!wallet) throw new Error("Wallet update failed");

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      "wallet.edit_address",
      "wallet",
      wallet.id,
      {
        new_address: data.address,
      },
    );

    return wallet;
  });

export const setWalletEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    wallet_id: z.string().uuid(),
    enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallet_addresses")
      .select("*")
      .eq("id", data.wallet_id)
      .single();

    if (walletError) throw new Error(walletError.message);
    if (!wallet) throw new Error("Wallet not found");

    const state = normalizeWalletState(wallet.memo);
    const memo = serializeWalletState(wallet.memo, { enabled: data.enabled, frozen: state.frozen });

    const { data: updatedWallet, error: updateError } = await supabaseAdmin
      .from("wallet_addresses")
      .update({ memo })
      .eq("id", data.wallet_id)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);
    if (!updatedWallet) throw new Error("Wallet update failed");

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      data.enabled ? "wallet.enable" : "wallet.disable",
      "wallet",
      updatedWallet.id,
      {
        enabled: data.enabled,
      },
    );

    return updatedWallet;
  });

export const freezeWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ wallet_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallet_addresses")
      .select("*")
      .eq("id", data.wallet_id)
      .single();

    if (walletError) throw new Error(walletError.message);
    if (!wallet) throw new Error("Wallet not found");

    const state = normalizeWalletState(wallet.memo);
    const memo = serializeWalletState(wallet.memo, { enabled: state.enabled, frozen: true, userMemo: state.userMemo });

    const { data: updatedWallet, error: updateError } = await supabaseAdmin
      .from("wallet_addresses")
      .update({ memo })
      .eq("id", data.wallet_id)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);
    if (!updatedWallet) throw new Error("Wallet update failed");

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      "wallet.freeze",
      "wallet",
      updatedWallet.id,
      {
        frozen: true,
      },
    );

    return updatedWallet;
  });

export const unfreezeWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ wallet_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallet_addresses")
      .select("*")
      .eq("id", data.wallet_id)
      .single();

    if (walletError) throw new Error(walletError.message);
    if (!wallet) throw new Error("Wallet not found");

    const state = normalizeWalletState(wallet.memo);
    const memo = serializeWalletState(wallet.memo, { enabled: state.enabled, frozen: false, userMemo: state.userMemo });

    const { data: updatedWallet, error: updateError } = await supabaseAdmin
      .from("wallet_addresses")
      .update({ memo })
      .eq("id", data.wallet_id)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);
    if (!updatedWallet) throw new Error("Wallet update failed");

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      "wallet.unfreeze",
      "wallet",
      updatedWallet.id,
      {
        frozen: false,
      },
    );

    return updatedWallet;
  });

export const adjustWalletBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    asset: z.string().min(2).max(20),
    amount: z.number().finite(),
    note: z.string().max(500).optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBalanceEditor(context);

    const { data: existingBalance, error: balanceError } = await supabaseAdmin
      .from("balances")
      .select("*")
      .eq("user_id", data.user_id)
      .eq("asset", data.asset)
      .maybeSingle();

    if (balanceError) throw new Error(balanceError.message);

    const nextAvailable = Number(existingBalance?.available ?? 0) + data.amount;
    if (nextAvailable < 0) throw new Error("Balance would go negative");

    if (existingBalance) {
      await supabaseAdmin.from("balances").update({
        available: nextAvailable,
        updated_at: new Date().toISOString(),
      }).eq("id", existingBalance.id);
    } else {
      await supabaseAdmin.from("balances").insert({
        user_id: data.user_id,
        asset: data.asset,
        available: nextAvailable,
        locked: 0,
      });
    }

    await supabaseAdmin.from("transactions").insert({
      user_id: data.user_id,
      asset: data.asset,
      type: "adjustment",
      amount: data.amount,
      balance_after: nextAvailable,
      reference_id: null,
      reference_type: null,
      note: data.note ?? `Manual balance adjustment by ${context.claims.email ?? context.userId}`,
    });

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      data.amount >= 0 ? "wallet.balance.add" : "wallet.balance.subtract",
      "wallet_balance",
      data.user_id,
      {
        user_id: data.user_id,
        asset: data.asset,
        amount: data.amount,
        note: data.note ?? null,
      },
    );

    return {
      user_id: data.user_id,
      asset: data.asset,
      available: nextAvailable,
    };
  });

export const lockWalletBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    asset: z.string().min(2).max(20),
    amount: z.number().positive(),
    note: z.string().max(500).optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBalanceEditor(context);

    const { data: balance, error: balanceError } = await supabaseAdmin
      .from("balances")
      .select("*")
      .eq("user_id", data.user_id)
      .eq("asset", data.asset)
      .maybeSingle();

    if (balanceError) throw new Error(balanceError.message);
    if (!balance) throw new Error("Balance row not found");

    const avail = Number(balance.available);
    const locked = Number(balance.locked);
    if (avail < data.amount) throw new Error("Insufficient available balance");

    const nextAvailable = avail - data.amount;
    const nextLocked = locked + data.amount;

    await supabaseAdmin.from("balances").update({
      available: nextAvailable,
      locked: nextLocked,
      updated_at: new Date().toISOString(),
    }).eq("id", balance.id);

    await supabaseAdmin.from("transactions").insert({
      user_id: data.user_id,
      asset: data.asset,
      type: "adjustment",
      amount: -data.amount,
      balance_after: nextAvailable,
      reference_id: null,
      reference_type: null,
      note: data.note ?? `Balance locked by ${context.claims.email ?? context.userId}`,
    });

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      "wallet.balance.lock",
      "wallet_balance",
      balance.id,
      {
        user_id: data.user_id,
        asset: data.asset,
        amount: data.amount,
        note: data.note ?? null,
      },
    );

    return {
      user_id: data.user_id,
      asset: data.asset,
      available: nextAvailable,
      locked: nextLocked,
    };
  });

export const unlockWalletBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    asset: z.string().min(2).max(20),
    amount: z.number().positive(),
    note: z.string().max(500).optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBalanceEditor(context);

    const { data: balance, error: balanceError } = await supabaseAdmin
      .from("balances")
      .select("*")
      .eq("user_id", data.user_id)
      .eq("asset", data.asset)
      .maybeSingle();

    if (balanceError) throw new Error(balanceError.message);
    if (!balance) throw new Error("Balance row not found");

    const avail = Number(balance.available);
    const locked = Number(balance.locked);
    if (locked < data.amount) throw new Error("Insufficient locked balance");

    const nextAvailable = avail + data.amount;
    const nextLocked = locked - data.amount;

    await supabaseAdmin.from("balances").update({
      available: nextAvailable,
      locked: nextLocked,
      updated_at: new Date().toISOString(),
    }).eq("id", balance.id);

    await supabaseAdmin.from("transactions").insert({
      user_id: data.user_id,
      asset: data.asset,
      type: "adjustment",
      amount: data.amount,
      balance_after: nextAvailable,
      reference_id: null,
      reference_type: null,
      note: data.note ?? `Balance unlocked by ${context.claims.email ?? context.userId}`,
    });

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      "wallet.balance.unlock",
      "wallet_balance",
      balance.id,
      {
        user_id: data.user_id,
        asset: data.asset,
        amount: data.amount,
        note: data.note ?? null,
      },
    );

    return {
      user_id: data.user_id,
      asset: data.asset,
      available: nextAvailable,
      locked: nextLocked,
    };
  });

export const internalTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    from_user_id: z.string().uuid(),
    to_user_id: z.string().uuid(),
    asset: z.string().min(2).max(20),
    amount: z.number().positive(),
    note: z.string().max(500).optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBalanceEditor(context);

    if (data.from_user_id === data.to_user_id) throw new Error("Source and destination must differ");

    const transferRef = createTransferReference();

    const [fromBalanceResult, toBalanceResult] = await Promise.all([
      supabaseAdmin.from("balances").select("*").eq("user_id", data.from_user_id).eq("asset", data.asset).maybeSingle(),
      supabaseAdmin.from("balances").select("*").eq("user_id", data.to_user_id).eq("asset", data.asset).maybeSingle(),
    ]);

    if (fromBalanceResult.error) throw new Error(fromBalanceResult.error.message);
    if (toBalanceResult.error) throw new Error(toBalanceResult.error.message);

    const sourceBalance = fromBalanceResult.data;
    const destinationBalance = toBalanceResult.data;

    if (!sourceBalance) throw new Error("Source balance row not found");
    if (Number(sourceBalance.available) < data.amount) throw new Error("Insufficient funds for transfer");

    const sourceAvailable = Number(sourceBalance.available) - data.amount;
    const destinationAvailable = Number(destinationBalance?.available ?? 0) + data.amount;

    await supabaseAdmin.from("balances").update({
      available: sourceAvailable,
      updated_at: new Date().toISOString(),
    }).eq("id", sourceBalance.id);

    if (destinationBalance) {
      await supabaseAdmin.from("balances").update({
        available: destinationAvailable,
        updated_at: new Date().toISOString(),
      }).eq("id", destinationBalance.id);
    } else {
      await supabaseAdmin.from("balances").insert({
        user_id: data.to_user_id,
        asset: data.asset,
        available: destinationAvailable,
        locked: 0,
      });
    }

    await supabaseAdmin.from("transactions").insert([
      {
        user_id: data.from_user_id,
        asset: data.asset,
        type: "transfer",
        amount: -data.amount,
        balance_after: sourceAvailable,
        reference_id: transferRef,
        reference_type: "internal_transfer",
        note: data.note ?? `Internal transfer sent by ${context.claims.email ?? context.userId}`,
      },
      {
        user_id: data.to_user_id,
        asset: data.asset,
        type: "transfer",
        amount: data.amount,
        balance_after: destinationAvailable,
        reference_id: transferRef,
        reference_type: "internal_transfer",
        note: data.note ?? `Internal transfer received by ${context.claims.email ?? context.userId}`,
      },
    ]);

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      "wallet.internal_transfer",
      "wallet_transfer",
      transferRef,
      {
        from_user_id: data.from_user_id,
        to_user_id: data.to_user_id,
        asset: data.asset,
        amount: data.amount,
        note: data.note ?? null,
      },
    );

    return {
      transfer_id: transferRef,
      from_user_id: data.from_user_id,
      to_user_id: data.to_user_id,
      asset: data.asset,
      amount: data.amount,
      source_available: sourceAvailable,
      destination_available: destinationAvailable,
    };
  });

export const getTreasurySnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [balancesResult, walletResult, transactionResult, depositResult, withdrawalResult] = await Promise.all([
      supabaseAdmin.from("balances").select("available, locked, asset"),
      supabaseAdmin.from("wallet_addresses").select("id"),
      supabaseAdmin.from("transactions").select("created_at, amount, reference_type, type"),
      supabaseAdmin.from("deposits").select("created_at, amount, status"),
      supabaseAdmin.from("withdrawals").select("created_at, amount, status"),
    ]);

    if (balancesResult.error) throw new Error(balancesResult.error.message);
    if (walletResult.error) throw new Error(walletResult.error.message);
    if (transactionResult.error) throw new Error(transactionResult.error.message);
    if (depositResult.error) throw new Error(depositResult.error.message);
    if (withdrawalResult.error) throw new Error(withdrawalResult.error.message);

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const wallets = walletResult.data ?? [];
    const balanceRows = balancesResult.data ?? [];

    const totalAvailable = balanceRows.reduce((sum, row) => sum + Number(row.available ?? 0), 0);
    const totalLocked = balanceRows.reduce((sum, row) => sum + Number(row.locked ?? 0), 0);
    const pendingWithdrawals = (withdrawalResult.data ?? [])
      .filter((entry) => (entry.status === "pending" || entry.status === "hold"))
      .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);

    const recentTxns = (transactionResult.data ?? []).filter((entry) => entry.created_at >= dayAgo);
    const recentTransfers = recentTxns.filter((entry) => entry.reference_type === "internal_transfer");
    const recentDeposits = (depositResult.data ?? []).filter((entry) => entry.created_at >= dayAgo);
    const recentWithdrawals = (withdrawalResult.data ?? []).filter((entry) => entry.created_at >= dayAgo);

    const snapshot: TreasurySnapshot = {
      total_wallet_balance: totalAvailable + totalLocked,
      total_locked_liabilities: totalLocked,
      total_reserves: totalAvailable,
      pending_withdrawal_liability: pendingWithdrawals,
      active_wallets: wallets.length,
      total_wallets: wallets.length,
      recent_transactions_24h: recentTxns.length,
      recent_internal_transfers_24h: recentTransfers.length,
      recent_deposits_24h: recentDeposits.length,
      recent_withdrawals_24h: recentWithdrawals.length,
    };

    return snapshot;
  });

export const getRecentWalletAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    limit: z.number().int().min(1).max(250).optional().default(100),
  }).parse(input))
  .handler(async ({ data }) => {
    const { data: auditRows, error } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (error) throw new Error(error.message);
    return auditRows ?? [];
  });
