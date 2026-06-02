import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type {
  AccountStatus,
  KycLevel,
  NetworkType,
  UserManagementDetail,
  UserManagementSnapshot,
} from "./types";

type UserRole = Database["public"]["Enums"]["app_role"];

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!data) throw new Error("Forbidden: admin role required");
}

async function audit(actorId: string, actorEmail: string | undefined, action: string, details: Record<string, unknown>, targetId?: string, targetType?: string) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    actor_email: actorEmail ?? null,
    action,
    target_id: targetId ?? null,
    target_type: targetType ?? null,
    details: details as never,
  });
}

function normalizeIp(value: unknown) {
  return value ? String(value) : null;
}

export const listUserManagementSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    search: z.string().max(200).optional().default(""),
    status: z.enum(["active", "frozen", "banned"]).optional(),
    limit: z.number().int().min(10).max(250).optional().default(100),
    offset: z.number().int().min(0).optional().default(0),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const [profilesResult, rolesResult, balancesResult, walletResult, loginHistoryResult] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("*"),
      supabaseAdmin.from("balances").select("*"),
      supabaseAdmin.from("wallet_addresses").select("*"),
      supabaseAdmin.from("login_history").select("*").order("created_at", { ascending: false }),
    ]);

    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (rolesResult.error) throw new Error(rolesResult.error.message);
    if (balancesResult.error) throw new Error(balancesResult.error.message);
    if (walletResult.error) throw new Error(walletResult.error.message);
    if (loginHistoryResult.error) throw new Error(loginHistoryResult.error.message);

    const rolesByUser = new Map<string, string[]>();
    (rolesResult.data ?? []).forEach((role) => {
      const current = rolesByUser.get(role.user_id) ?? [];
      current.push(role.role);
      rolesByUser.set(role.user_id, current);
    });

    const balancesByUser = new Map<string, Database["public"]["Tables"]["balances"]["Row"][]>();
    (balancesResult.data ?? []).forEach((balance) => {
      const current = balancesByUser.get(balance.user_id) ?? [];
      current.push(balance);
      balancesByUser.set(balance.user_id, current);
    });

    const walletsByUser = new Map<string, Database["public"]["Tables"]["wallet_addresses"]["Row"][]>();
    (walletResult.data ?? []).forEach((wallet) => {
      const current = walletsByUser.get(wallet.user_id) ?? [];
      current.push(wallet);
      walletsByUser.set(wallet.user_id, current);
    });

    const latestLoginByUser = new Map<string, Database["public"]["Tables"]["login_history"]["Row"]>();
    (loginHistoryResult.data ?? []).forEach((entry) => {
      if (!latestLoginByUser.has(entry.user_id)) {
        latestLoginByUser.set(entry.user_id, entry);
      }
    });

    const search = data.search.trim().toLowerCase();
    let filtered = (profilesResult.data ?? []).filter((profile) => {
      if (data.status && profile.status !== data.status) return false;
      if (!search) return true;
      const walletAddresses = walletsByUser.get(profile.id) ?? [];
      return [
        profile.email,
        profile.display_name,
        profile.phone,
        profile.id,
      ].some((value) => value?.toLowerCase().includes(search))
        || walletAddresses.some((wallet) => wallet.address.toLowerCase().includes(search));
    });

    filtered = filtered.slice(data.offset, data.offset + data.limit);

    const snapshots: UserManagementSnapshot[] = filtered.map((profile) => {
      const balances = balancesByUser.get(profile.id) ?? [];
      const walletAddresses = walletsByUser.get(profile.id) ?? [];
      const lastLogin = latestLoginByUser.get(profile.id);
      const roles = (rolesByUser.get(profile.id) ?? []).filter((role): role is UserRole =>
        role === "admin" || role === "user" || role === "moderator"
      );
      return {
        id: profile.id,
        email: profile.email,
        display_name: profile.display_name,
        phone: profile.phone,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        status: profile.status,
        kyc_level: profile.kyc_level,
        trading_frozen: profile.trading_frozen,
        withdrawals_frozen: profile.withdrawals_frozen,
        roles,
        total_available: balances.reduce((sum, row) => sum + Number(row.available ?? 0), 0),
        total_locked: balances.reduce((sum, row) => sum + Number(row.locked ?? 0), 0),
        wallet_count: walletAddresses.length,
        last_login_at: lastLogin?.created_at ?? null,
      };
    });

    return snapshots;
  });

export const getUserManagementDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const [profileResult, rolesResult, balancesResult, walletResult, loginHistoryResult, transactionsResult, depositsResult, withdrawalsResult, kycResult, auditResult] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", data.user_id).single(),
      supabaseAdmin.from("user_roles").select("*").eq("user_id", data.user_id),
      supabaseAdmin.from("balances").select("*").eq("user_id", data.user_id).order("asset"),
      supabaseAdmin.from("wallet_addresses").select("*").eq("user_id", data.user_id).order("created_at", { ascending: false }),
      supabaseAdmin.from("login_history").select("*").eq("user_id", data.user_id).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("transactions").select("*").eq("user_id", data.user_id).order("created_at", { ascending: false }).limit(250),
      supabaseAdmin.from("deposits").select("*").eq("user_id", data.user_id).order("created_at", { ascending: false }).limit(250),
      supabaseAdmin.from("withdrawals").select("*").eq("user_id", data.user_id).order("created_at", { ascending: false }).limit(250),
      supabaseAdmin.from("kyc_submissions").select("*").eq("user_id", data.user_id).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("audit_logs").select("*").or(`target_id.eq.${data.user_id},target_type.eq.user`).order("created_at", { ascending: false }).limit(250),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    if (rolesResult.error) throw new Error(rolesResult.error.message);
    if (balancesResult.error) throw new Error(balancesResult.error.message);
    if (walletResult.error) throw new Error(walletResult.error.message);
    if (loginHistoryResult.error) throw new Error(loginHistoryResult.error.message);
    if (transactionsResult.error) throw new Error(transactionsResult.error.message);
    if (depositsResult.error) throw new Error(depositsResult.error.message);
    if (withdrawalsResult.error) throw new Error(withdrawalsResult.error.message);
    if (kycResult.error) throw new Error(kycResult.error.message);
    if (auditResult.error) throw new Error(auditResult.error.message);

    if (!profileResult.data) throw new Error("User not found");

    const detail: UserManagementDetail = {
      profile: profileResult.data,
      roles: rolesResult.data ?? [],
      balances: balancesResult.data ?? [],
      wallet_addresses: walletResult.data ?? [],
      login_history: (loginHistoryResult.data ?? []).map((entry) => ({
        ...entry,
        ip_address: normalizeIp(entry.ip_address),
      })),
      transactions: transactionsResult.data ?? [],
      deposits: depositsResult.data ?? [],
      withdrawals: withdrawalsResult.data ?? [],
      kyc_submissions: kycResult.data ?? [],
      audit_logs: (auditResult.data ?? []).map((entry) => ({
        ...entry,
        ip_address: normalizeIp(entry.ip_address),
      })),
    };

    return detail;
  });

export const updateUserManagementControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    status: z.enum(["active", "frozen", "banned"]).optional(),
    trading_frozen: z.boolean().optional(),
    withdrawals_frozen: z.boolean().optional(),
    kyc_level: z.enum(["none", "basic", "advanced"]).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.status !== undefined) patch.status = data.status;
    if (data.trading_frozen !== undefined) patch.trading_frozen = data.trading_frozen;
    if (data.withdrawals_frozen !== undefined) patch.withdrawals_frozen = data.withdrawals_frozen;
    if (data.kyc_level !== undefined) patch.kyc_level = data.kyc_level;

    const { data: updated, error } = await supabaseAdmin
      .from("profiles")
      .update(patch as never)
      .eq("id", data.user_id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    if (!updated) throw new Error("User update failed");

    await audit(
      context.userId,
      context.claims.email as string | undefined,
      "user.control_update",
      patch,
      data.user_id,
      "user",
    );

    return updated;
  });

export const setUserManagementRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    role: z.enum(["admin", "moderator"]),
    grant: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    if (data.user_id === context.userId && !data.grant && (data.role === "admin" || data.role === "moderator")) {
      throw new Error("Cannot revoke your own role");
    }

    if (data.grant) {
      const { error } = await supabaseAdmin.from("user_roles").upsert({
        user_id: data.user_id,
        role: data.role,
      }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }

    await audit(
      context.userId,
      context.claims.email as string | undefined,
      data.grant ? `role.grant_${data.role}` : `role.revoke_${data.role}`,
      { role: data.role, grant: data.grant },
      data.user_id,
      "user",
    );

    return { ok: true };
  });

export const adjustUserManagementBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    asset: z.string().min(2).max(10),
    delta: z.number().refine((value) => value !== 0, "delta must be non-zero"),
    note: z.string().max(500).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: existing } = await supabaseAdmin
      .from("balances")
      .select("available, locked")
      .eq("user_id", data.user_id)
      .eq("asset", data.asset)
      .maybeSingle();

    const currentAvailable = Number(existing?.available ?? 0);
    const updatedAvailable = currentAvailable + data.delta;
    if (updatedAvailable < 0) throw new Error("Balance would go negative");

    if (existing) {
      const { error } = await supabaseAdmin
        .from("balances")
        .update({
          available: updatedAvailable,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", data.user_id)
        .eq("asset", data.asset);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("balances").insert({
        user_id: data.user_id,
        asset: data.asset,
        available: updatedAvailable,
        locked: 0,
      });
      if (error) throw new Error(error.message);
    }

    const { error: txnError } = await supabaseAdmin.from("transactions").insert({
      user_id: data.user_id,
      asset: data.asset,
      type: "adjustment",
      amount: data.delta,
      balance_after: updatedAvailable,
      note: data.note ?? `Adjusted by ${context.claims.email ?? context.userId}`,
    });
    if (txnError) throw new Error(txnError.message);

    await audit(
      context.userId,
      context.claims.email as string | undefined,
      "balance.adjust",
      { asset: data.asset, delta: data.delta, note: data.note ?? null },
      data.user_id,
      "user",
    );

    return { user_id: data.user_id, asset: data.asset, available: updatedAvailable };
  });

export const assignUserManagementWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    asset: z.string().min(2).max(10),
    network: z.enum(["BTC", "ERC20", "TRC20", "BEP20", "SOL"]),
    address: z.string().min(4).max(200),
    memo: z.string().max(200).optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: stored, error } = await supabaseAdmin.from("wallet_addresses").upsert({
      user_id: data.user_id,
      asset: data.asset,
      network: data.network as NetworkType,
      address: data.address,
      memo: data.memo ?? null,
      assigned_by: context.userId,
    }, { onConflict: "user_id,asset,network" }).select("*").single();

    if (error) throw new Error(error.message);
    if (!stored) throw new Error("Wallet assignment failed");

    await audit(
      context.userId,
      context.claims.email as string | undefined,
      "wallet.assign",
      { asset: data.asset, network: data.network, address: data.address },
      data.user_id,
      "user",
    );

    return stored;
  });

export const listUserManagementLoginHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid(), limit: z.number().int().min(10).max(250).optional().default(100) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("login_history")
      .select("*")
      .eq("user_id", data.user_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (error) throw new Error(error.message);

    return (rows ?? []).map((row) => ({
      ...row,
      ip_address: normalizeIp(row.ip_address),
    }));
  });

export const listUserManagementAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid(), limit: z.number().int().min(10).max(250).optional().default(100) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .or(`target_id.eq.${data.user_id},actor_id.eq.${data.user_id}`)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (error) throw new Error(error.message);

    return (rows ?? []).map((row) => ({
      ...row,
      ip_address: normalizeIp(row.ip_address),
    }));
  });
