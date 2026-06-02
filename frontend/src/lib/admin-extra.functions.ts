import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

async function audit(actorId: string, email: string | undefined, action: string, details?: Record<string, unknown>, targetId?: string, targetType?: string) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    actor_email: email ?? null,
    action,
    target_id: targetId ?? null,
    target_type: targetType ?? null,
    details: (details ?? {}) as never,
  });

  try {
    await supabaseAdmin.from("security_events").insert({
      user_id: actorId,
      event_type: `admin.${action}`,
      severity: action.includes("role") || action.includes("platform") ? "warning" : "info",
      risk_score: action.includes("role") ? 25 : action.includes("platform") ? 20 : 10,
      details: {
        action,
        target_id: targetId ?? null,
        target_type: targetType ?? null,
        ...details,
      },
    });
  } catch (error) {
    console.warn("[Security] failed to record admin audit security event", error);
  }
}

// ============ KYC ============
export const reviewKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    kyc_id: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    note: z.string().max(500).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: kyc, error } = await supabaseAdmin
      .from("kyc_submissions").select("*").eq("id", data.kyc_id).single();
    if (error || !kyc) throw new Error("KYC not found");
    await supabaseAdmin.from("kyc_submissions").update({
      status: data.decision,
      admin_note: data.note ?? null,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", kyc.id);
    if (data.decision === "approved") {
      await supabaseAdmin.from("profiles").update({ kyc_level: kyc.level }).eq("id", kyc.user_id);
    }
    await audit(context.userId, context.claims.email as string | undefined,
      `kyc.${data.decision}`, { level: kyc.level, user_id: kyc.user_id }, kyc.id, "kyc");
    return { ok: true };
  });

// ============ ASSETS ============
export const updateAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    symbol: z.string().min(2).max(10),
    enabled: z.boolean().optional(),
    deposit_enabled: z.boolean().optional(),
    withdrawal_enabled: z.boolean().optional(),
    min_withdrawal: z.number().min(0).optional(),
    withdrawal_fee: z.number().min(0).optional(),
    networks: z.array(z.enum(["BTC", "ERC20", "TRC20", "BEP20", "SOL"])).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { symbol, ...patch } = data;
    const { error } = await supabaseAdmin.from("assets").update(patch as never).eq("symbol", symbol);
    if (error) throw new Error(error.message);
    await audit(context.userId, context.claims.email as string | undefined,
      "asset.update", patch as Record<string, unknown>, symbol, "asset");
    return { ok: true };
  });

// ============ PLATFORM SETTINGS ============
export const updatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    trading_enabled: z.boolean().optional(),
    deposits_enabled: z.boolean().optional(),
    withdrawals_enabled: z.boolean().optional(),
    registration_enabled: z.boolean().optional(),
    emergency_shutdown: z.boolean().optional(),
    maintenance_message: z.string().max(500).nullable().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("platform_settings").update({
      ...data,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    } as never).eq("id", 1);
    if (error) throw new Error(error.message);
    await audit(context.userId, context.claims.email as string | undefined,
      "platform.settings_update", data as Record<string, unknown>);
    return { ok: true };
  });

// ============ MODERATOR ROLE ============
export const setModeratorRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ user_id: z.string().uuid(), grant: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.grant) {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: data.user_id, role: "moderator" as never },
        { onConflict: "user_id,role" },
      );
    } else {
      await supabaseAdmin.from("user_roles").delete()
        .eq("user_id", data.user_id).eq("role", "moderator" as never);
    }
    await audit(context.userId, context.claims.email as string | undefined,
      data.grant ? "role.grant_moderator" : "role.revoke_moderator", undefined, data.user_id, "user");
    return { ok: true };
  });

// ============ ANALYTICS ============
export const platformAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [users, deposits, withdrawals, kyc, balances] = await Promise.all([
      supabaseAdmin.from("profiles").select("status", { count: "exact", head: true }),
      supabaseAdmin.from("deposits").select("amount, asset, status"),
      supabaseAdmin.from("withdrawals").select("amount, fee, asset, status"),
      supabaseAdmin.from("kyc_submissions").select("status", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("balances").select("asset, available, locked"),
    ]);

    const sum = (arr: Array<{ amount: unknown; asset: string; status: string }> | null, status: string) => {
      const out: Record<string, number> = {};
      (arr ?? []).filter((r) => r.status === status).forEach((r) => {
        out[r.asset] = (out[r.asset] ?? 0) + Number(r.amount);
      });
      return out;
    };
    const feeSum: Record<string, number> = {};
    (withdrawals.data ?? []).filter((r) => r.status === "approved").forEach((r) => {
      feeSum[r.asset] = (feeSum[r.asset] ?? 0) + Number(r.fee ?? 0);
    });
    const balanceSum: Record<string, { available: number; locked: number }> = {};
    (balances.data ?? []).forEach((b) => {
      const k = b.asset;
      balanceSum[k] = balanceSum[k] ?? { available: 0, locked: 0 };
      balanceSum[k].available += Number(b.available);
      balanceSum[k].locked += Number(b.locked);
    });

    return {
      users_total: users.count ?? 0,
      kyc_pending: kyc.count ?? 0,
      deposits_pending: (deposits.data ?? []).filter((d) => d.status === "pending").length,
      withdrawals_pending: (withdrawals.data ?? []).filter((w) => w.status === "pending").length,
      deposits_approved_total: sum(deposits.data, "approved"),
      withdrawals_approved_total: sum(withdrawals.data, "approved"),
      revenue_fees: feeSum,
      total_user_balances: balanceSum,
    };
  });

// ============ KYC LIST ============
export const adminListKyc = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin.from("kyc_submissions")
      .select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data;
  });

// ============ LOGIN HISTORY (per user) ============
export const adminUserLoginHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin.from("login_history")
      .select("*").eq("user_id", data.user_id)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({ ...r, ip_address: r.ip_address ? String(r.ip_address) : null }));
  });

// ============ RESET PASSWORD (admin sends recovery link) ============
export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ email: z.string().email() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, context.claims.email as string | undefined,
      "user.password_reset_sent", { email: data.email });
    return { ok: true };
  });
