import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { DepositDetailRecord, DepositDashboardItem, DepositDecision, DepositFilter } from "./types";

const DECISION_STATUS_MAP: Record<DepositDecision, "approved" | "rejected" | "hold"> = {
  approved: "approved",
  rejected: "rejected",
  hold: "hold",
};

const FILTER_STATUS_MAP: Record<DepositFilter, "hold" | "approved" | "rejected" | "pending"> = {
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

async function assertDepositApprover(context: { userId: string; claims: Record<string, unknown> }) {
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

export const listDepositDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    search: z.string().max(200).optional().default(""),
    status: z.enum(["pending", "approved", "rejected", "held"]).optional(),
    limit: z.number().int().min(10).max(250).optional().default(200),
    offset: z.number().int().min(0).optional().default(0),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const filteredStatus = data.status ? FILTER_STATUS_MAP[data.status] : undefined;

    const [depositResult, profileResult, walletResult, loginHistoryResult] = await Promise.all([
      supabaseAdmin
        .from("deposits")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(data.limit)
        .range(data.offset, data.offset + data.limit - 1),
      supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("wallet_addresses").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("login_history").select("*").order("created_at", { ascending: false }),
    ]);

    if (depositResult.error) throw new Error(depositResult.error.message);
    if (profileResult.error) throw new Error(profileResult.error.message);
    if (walletResult.error) throw new Error(walletResult.error.message);
    if (loginHistoryResult.error) throw new Error(loginHistoryResult.error.message);

    const profilesByUser = new Map<string, Database["public"]["Tables"]["profiles"]["Row"]>();
    (profileResult.data ?? []).forEach((profile) => profilesByUser.set(profile.id, profile));

    const walletsByUser = new Map<string, Database["public"]["Tables"]["wallet_addresses"]["Row"][]>();
    (walletResult.data ?? []).forEach((wallet) => {
      const current = walletsByUser.get(wallet.user_id) ?? [];
      current.push(wallet);
      walletsByUser.set(wallet.user_id, current);
    });

    const latestLoginsByUser = new Map<string, Database["public"]["Tables"]["login_history"]["Row"]>();
    (loginHistoryResult.data ?? []).forEach((entry) => {
      if (!latestLoginsByUser.has(entry.user_id)) latestLoginsByUser.set(entry.user_id, entry);
    });

    const search = data.search.trim().toLowerCase();
    const filtered = (depositResult.data ?? []).filter((deposit) => {
      if (filteredStatus && deposit.status !== filteredStatus) return false;

      if (!search) return true;

      const profile = profilesByUser.get(deposit.user_id);
      const assignedWallets = walletsByUser.get(deposit.user_id) ?? [];
      return [
        deposit.id,
        deposit.address,
        deposit.txid,
        deposit.asset,
        profile?.email,
        profile?.display_name,
      ].some((value) => value?.toLowerCase().includes(search))
        || assignedWallets.some((wallet) => wallet.address.toLowerCase().includes(search));
    });

    const dashboardItems: DepositDashboardItem[] = filtered.map((deposit) => {
      const profile = profilesByUser.get(deposit.user_id);
      const assignedWallet = (walletsByUser.get(deposit.user_id) ?? [])
        .find((wallet) => wallet.asset === deposit.asset && wallet.network === deposit.network);
      const latestLogin = latestLoginsByUser.get(deposit.user_id);

      return {
        ...deposit,
        display_status: normalizeDisplayStatus(deposit.status),
        user_email: profile?.email ?? null,
        user_display_name: profile?.display_name ?? null,
        user_status: profile?.status ?? null,
        assigned_wallet_address: assignedWallet?.address ?? null,
        latest_login_at: latestLogin?.created_at ?? null,
      };
    });

    return dashboardItems;
  });

export const getDepositDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ deposit_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: deposit, error: depositError } = await supabaseAdmin
      .from("deposits")
      .select("*")
      .eq("id", data.deposit_id)
      .single();

    if (depositError) throw new Error(depositError.message);
    if (!deposit) throw new Error("Deposit not found");

    const [profileResult, walletResult, transactionResult, loginHistoryResult, auditResult] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", deposit.user_id).maybeSingle(),
      supabaseAdmin.from("wallet_addresses").select("*").eq("user_id", deposit.user_id).eq("asset", deposit.asset).eq("network", deposit.network).maybeSingle(),
      supabaseAdmin.from("transactions").select("*").eq("reference_id", deposit.id).eq("reference_type", "deposit").order("created_at", { ascending: false }),
      supabaseAdmin.from("login_history").select("*").eq("user_id", deposit.user_id).order("created_at", { ascending: false }).limit(25),
      supabaseAdmin.from("audit_logs").select("*").or(`target_id.eq.${deposit.id},target_type.eq.deposit`).order("created_at", { ascending: false }).limit(100),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    if (walletResult.error) throw new Error(walletResult.error.message);
    if (transactionResult.error) throw new Error(transactionResult.error.message);
    if (loginHistoryResult.error) throw new Error(loginHistoryResult.error.message);
    if (auditResult.error) throw new Error(auditResult.error.message);

    const userProfile = profileResult.data ?? null;
    const assignedWallet = walletResult.data ?? null;
    const depositTransactions = transactionResult.data ?? [];
    const recentLoginHistory = (loginHistoryResult.data ?? []).map((entry) => ({
      ...entry,
      ip_address: normalizeIp(entry.ip_address),
    }));
    const auditEntries = (auditResult.data ?? []).map((entry) => ({
      ...entry,
      ip_address: normalizeIp(entry.ip_address),
    }));

    const detail: DepositDetailRecord = {
      deposit,
      user_profile: userProfile,
      assigned_wallet: assignedWallet,
      deposit_transactions: depositTransactions,
      recent_login_history: recentLoginHistory,
      audit_entries: auditEntries,
    };

    return detail;
  });

export const reviewDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    deposit_id: z.string().uuid(),
    decision: z.enum(["approved", "rejected", "hold"]),
    admin_note: z.string().max(500).optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const approver = await assertDepositApprover(context);

    const { data: deposit, error } = await supabaseAdmin
      .from("deposits")
      .select("*")
      .eq("id", data.deposit_id)
      .single();

    if (error) throw new Error(error.message);
    if (!deposit) throw new Error("Deposit not found");
    if (deposit.status !== "pending" && deposit.status !== "hold") {
      throw new Error(`Deposit already ${normalizeDisplayStatus(deposit.status)}`);
    }

    const nextStatus = DECISION_STATUS_MAP[data.decision];
    const note = data.admin_note?.trim() ? data.admin_note.trim() : null;

    if (data.decision === "approved") {
      const { data: existingBalance } = await supabaseAdmin
        .from("balances")
        .select("available, locked")
        .eq("user_id", deposit.user_id)
        .eq("asset", deposit.asset)
        .maybeSingle();

      const currentAvailable = Number(existingBalance?.available ?? 0);
      const currentLocked = Number(existingBalance?.locked ?? 0);
      const nextAvailable = currentAvailable + Number(deposit.amount);

      await supabaseAdmin.from("balances").upsert({
        user_id: deposit.user_id,
        asset: deposit.asset,
        available: nextAvailable,
        locked: currentLocked,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,asset" });

      await supabaseAdmin.from("transactions").insert({
        user_id: deposit.user_id,
        asset: deposit.asset,
        type: "deposit",
        amount: Number(deposit.amount),
        balance_after: nextAvailable,
        reference_id: deposit.id,
        reference_type: "deposit",
        note: note ?? `Deposit approved by ${approver.role}`,
      });
    }

    const { data: updatedDeposit, error: updateError } = await supabaseAdmin
      .from("deposits")
      .update({
        status: nextStatus,
        admin_note: note,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", deposit.id)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);

    await writeAudit(
      context.userId,
      context.claims.email as string | undefined,
      `deposit.${data.decision}`,
      "deposit",
      deposit.id,
      {
        action: data.decision,
        asset: deposit.asset,
        amount: Number(deposit.amount),
        user_id: deposit.user_id,
        admin_note: note,
        approver_role: approver.role,
      },
    );

    return updatedDeposit;
  });

export const getRecentDepositAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ deposit_id: z.string().uuid(), limit: z.number().int().min(10).max(250).optional().default(100) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertDepositApprover(context);
    const { data: rows, error } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .eq("target_id", data.deposit_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      ...row,
      ip_address: normalizeIp(row.ip_address),
    }));
  });
