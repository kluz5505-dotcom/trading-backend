import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { WithdrawalDashboardItem, WithdrawalDetailRecord, WithdrawalDecision, WithdrawalFilter } from "./types";

const DECISION_STATUS_MAP: Record<WithdrawalDecision, "approved" | "rejected" | "hold"> = {
  approved: "approved",
  rejected: "rejected",
  hold: "hold",
};

const FILTER_STATUS_MAP: Record<WithdrawalFilter, "hold" | "approved" | "rejected" | "pending"> = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  held: "hold",
};

function normalizeDisplayStatus(status: string) {
  if (status === "hold") return "held";
  return status as "pending" | "approved" | "rejected";
}

function normalizeIp(value: unknown) {
  return value ? String(value) : null;
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

async function assertWithdrawalApprover(context: { userId: string; claims: Record<string, unknown> }) {
  const metadataRole = String(
    (context.claims.app_metadata as Record<string, unknown> | undefined)?.role ??
      (context.claims.user_metadata as Record<string, unknown> | undefined)?.role ??
      "",
  ).toLowerCase();

  const allowedClaimRoles = new Set(["super_admin", "finance_admin"]);
  if (allowedClaimRoles.has(metadataRole)) {
    return { role: metadataRole as "super_admin" | "finance_admin" };
  }

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);

  if (error) throw new Error(error.message);

  const dbRoles = (data ?? []).map((row) => row.role);
  if (dbRoles.includes("admin")) {
    return { role: "finance_admin" };
  }

  throw new Error("Forbidden: finance_admin or super_admin required");
}

function buildRiskFlags(amount: number, profile: Database["public"]["Tables"]["profiles"]["Row"] | undefined, recentWithdrawalCount: number) {
  const flags: string[] = [];
  if (amount >= 10000) flags.push("large_withdrawal");
  if (recentWithdrawalCount >= 3) flags.push("rapid_withdrawal_pattern");
  if (profile?.withdrawals_frozen) flags.push("withdrawals_frozen");
  return flags;
}

export const listWithdrawalDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    search: z.string().max(200).optional().default(""),
    status: z.enum(["pending", "approved", "rejected", "held"]).optional(),
    limit: z.number().int().min(10).max(250).optional().default(200),
    offset: z.number().int().min(0).optional().default(0),
  }).parse(input))
  .handler(async ({ data }) => {
    const filteredStatus = data.status ? FILTER_STATUS_MAP[data.status] : undefined;

    const [withdrawalResult, profilesResult, walletResult, loginHistoryResult] = await Promise.all([
      supabaseAdmin
        .from("withdrawals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(data.limit)
        .range(data.offset, data.offset + data.limit - 1),
      supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("wallet_addresses").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("login_history").select("*").order("created_at", { ascending: false }),
    ]);

    if (withdrawalResult.error) throw new Error(withdrawalResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (walletResult.error) throw new Error(walletResult.error.message);
    if (loginHistoryResult.error) throw new Error(loginHistoryResult.error.message);

    const profilesByUser = new Map<string, Database["public"]["Tables"]["profiles"]["Row"]>();
    (profilesResult.data ?? []).forEach((profile) => profilesByUser.set(profile.id, profile));

    const walletsByUser = new Map<string, Database["public"]["Tables"]["wallet_addresses"]["Row"][]>();
    (walletResult.data ?? []).forEach((wallet) => {
      const current = walletsByUser.get(wallet.user_id) ?? [];
      current.push(wallet);
      walletsByUser.set(wallet.user_id, current);
    });

    const latestLoginByUser = new Map<string, Database["public"]["Tables"]["login_history"]["Row"]>();
    (loginHistoryResult.data ?? []).forEach((entry) => {
      if (!latestLoginByUser.has(entry.user_id)) latestLoginByUser.set(entry.user_id, entry);
    });

    const search = data.search.trim().toLowerCase();
    const filtered = (withdrawalResult.data ?? []).filter((withdrawal) => {
      if (filteredStatus && withdrawal.status !== filteredStatus) return false;
      if (!search) return true;

      const profile = profilesByUser.get(withdrawal.user_id);
      const assignedWallets = walletsByUser.get(withdrawal.user_id) ?? [];
      return [
        withdrawal.id,
        withdrawal.to_address,
        withdrawal.asset,
        withdrawal.memo,
        profile?.email,
        profile?.display_name,
      ].some((value) => value?.toLowerCase().includes(search))
        || assignedWallets.some((wallet) => wallet.address.toLowerCase().includes(search));
    });

    const dashboardItems: WithdrawalDashboardItem[] = filtered.map((withdrawal) => {
      const profile = profilesByUser.get(withdrawal.user_id);
      const assignedWallet = (walletsByUser.get(withdrawal.user_id) ?? [])
        .find((wallet) => wallet.asset === withdrawal.asset && wallet.network === withdrawal.network);
      const latestLogin = latestLoginByUser.get(withdrawal.user_id);
      const recentWithdrawalCount = (withdrawalResult.data ?? []).filter((row) =>
        row.user_id === withdrawal.user_id && row.created_at >= new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      ).length;

      const riskFlags = buildRiskFlags(Number(withdrawal.amount), profile, recentWithdrawalCount);

      return {
        ...withdrawal,
        display_status: normalizeDisplayStatus(withdrawal.status),
        user_email: profile?.email ?? null,
        user_display_name: profile?.display_name ?? null,
        user_status: profile?.status ?? null,
        withdrawals_frozen: profile?.withdrawals_frozen ?? false,
        assigned_wallet_address: assignedWallet?.address ?? null,
        latest_login_at: latestLogin?.created_at ?? null,
        risk_flags: riskFlags,
        large_withdrawal_alert: riskFlags.includes("large_withdrawal"),
      };
    });

    return dashboardItems;
  });

export const getWithdrawalDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ withdrawal_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: withdrawal, error: withdrawalError } = await supabaseAdmin
      .from("withdrawals")
      .select("*")
      .eq("id", data.withdrawal_id)
      .single();

    if (withdrawalError) throw new Error(withdrawalError.message);
    if (!withdrawal) throw new Error("Withdrawal not found");

    const [profileResult, walletResult, transactionResult, sessionHistoryResult, auditResult] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", withdrawal.user_id).maybeSingle(),
      supabaseAdmin.from("wallet_addresses").select("*").eq("user_id", withdrawal.user_id).eq("asset", withdrawal.asset).eq("network", withdrawal.network).maybeSingle(),
      supabaseAdmin.from("transactions").select("*").eq("reference_id", withdrawal.id).eq("reference_type", "withdrawal").order("created_at", { ascending: false }),
      supabaseAdmin.from("login_history").select("*").eq("user_id", withdrawal.user_id).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("audit_logs").select("*").or(`target_id.eq.${withdrawal.id},target_type.eq.withdrawal`).order("created_at", { ascending: false }).limit(100),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    if (walletResult.error) throw new Error(walletResult.error.message);
    if (transactionResult.error) throw new Error(transactionResult.error.message);
    if (sessionHistoryResult.error) throw new Error(sessionHistoryResult.error.message);
    if (auditResult.error) throw new Error(auditResult.error.message);

    const recentWithdrawalCount = await supabaseAdmin
      .from("withdrawals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", withdrawal.user_id)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .then((result) => result.count ?? 0);

    const riskFlags = buildRiskFlags(Number(withdrawal.amount), profileResult.data ?? undefined, recentWithdrawalCount);

    const detail: WithdrawalDetailRecord = {
      withdrawal,
      user_profile: profileResult.data ?? null,
      assigned_wallet: walletResult.data ?? null,
      withdrawal_transactions: transactionResult.data ?? [],
      session_history: (sessionHistoryResult.data ?? []).map((entry) => ({
        ...entry,
        ip_address: normalizeIp(entry.ip_address),
      })),
      audit_entries: (auditResult.data ?? []).map((entry) => ({
        ...entry,
        ip_address: normalizeIp(entry.ip_address),
      })),
    };

    return {
      ...detail,
      risk_flags: riskFlags,
      large_withdrawal_alert: riskFlags.includes("large_withdrawal"),
    };
  });

export const reviewWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    withdrawal_id: z.string().uuid(),
    decision: z.enum(["approved", "rejected", "hold"]),
    admin_note: z.string().max(500).optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const approver = await assertWithdrawalApprover(context);

    const { data: withdrawal, error: withdrawalError } = await supabaseAdmin
      .from("withdrawals")
      .select("*")
      .eq("id", data.withdrawal_id)
      .single();

    if (withdrawalError) throw new Error(withdrawalError.message);
    if (!withdrawal) throw new Error("Withdrawal not found");
    if (withdrawal.status !== "pending" && withdrawal.status !== "hold") {
      throw new Error(`Withdrawal already ${normalizeDisplayStatus(withdrawal.status)}`);
    }

    const total = Number(withdrawal.amount) + Number(withdrawal.fee ?? 0);
    const nextStatus = DECISION_STATUS_MAP[data.decision];
    const note = data.admin_note?.trim() ? data.admin_note.trim() : null;

    const { data: balance, error: balanceError } = await supabaseAdmin
      .from("balances")
      .select("available, locked")
      .eq("user_id", withdrawal.user_id)
      .eq("asset", withdrawal.asset)
      .maybeSingle();

    if (balanceError) throw new Error(balanceError.message);
    if (!balance) throw new Error("Balance row missing");

    if (data.decision === "approved") {
      const newLocked = Number(balance.locked) - total;
      if (newLocked < 0) throw new Error("Locked balance inconsistency");
      await supabaseAdmin
        .from("balances")
        .update({
          locked: newLocked,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", withdrawal.user_id)
        .eq("asset", withdrawal.asset);

      const newBalanceAfter = Number(balance.available);
      await supabaseAdmin.from("transactions").insert({
        user_id: withdrawal.user_id,
        asset: withdrawal.asset,
        type: "withdrawal",
        amount: -total,
        balance_after: newBalanceAfter,
        reference_id: withdrawal.id,
        reference_type: "withdrawal",
        note: note ?? `Withdrawal approved by ${approver.role}`,
      });
    } else if (data.decision === "rejected") {
      const newLocked = Number(balance.locked) - total;
      const newAvailable = Number(balance.available) + total;
      if (newLocked < 0) throw new Error("Locked balance inconsistency");
      await supabaseAdmin
        .from("balances")
        .update({
          available: newAvailable,
          locked: newLocked,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", withdrawal.user_id)
        .eq("asset", withdrawal.asset);
    }

    const { data: updatedWithdrawal, error: updateError } = await supabaseAdmin
      .from("withdrawals")
      .update({
        status: nextStatus,
        admin_note: note,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", withdrawal.id)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      `withdrawal.${data.decision}`,
      "withdrawal",
      withdrawal.id,
      {
        user_id: withdrawal.user_id,
        asset: withdrawal.asset,
        amount: Number(withdrawal.amount),
        fee: Number(withdrawal.fee ?? 0),
        admin_note: note,
        approver_role: approver.role,
      },
    );

    return updatedWithdrawal;
  });

export const getRecentWithdrawalAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ withdrawal_id: z.string().uuid(), limit: z.number().int().min(10).max(250).optional().default(100) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertWithdrawalApprover(context);
    const { data: rows, error } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .eq("target_id", data.withdrawal_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      ...row,
      ip_address: normalizeIp(row.ip_address),
    }));
  });
