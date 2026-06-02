import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Admin-only server functions. Every handler verifies the caller has the
 * 'admin' role and writes an audit_logs row.
 */
async function assertAdmin(userId: string, email: string | undefined) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
  return { adminId: userId, adminEmail: email };
}

async function logAudit(opts: {
  actorId: string;
  actorEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: opts.actorId,
    actor_email: opts.actorEmail ?? null,
    action: opts.action,
    target_type: opts.targetType ?? null,
    target_id: opts.targetId ?? null,
    details: (opts.details ?? {}) as never,
  });

  try {
    await supabaseAdmin.from("security_events").insert({
      user_id: opts.actorId,
      event_type: `admin.${opts.action}`,
      severity: opts.action.includes("role") || opts.action.includes("balance") || opts.action.includes("withdrawal") ? "warning" : "info",
      risk_score: opts.action.includes("role") ? 25 : opts.action.includes("balance") || opts.action.includes("withdrawal") ? 20 : 10,
      details: {
        action: opts.action,
        target_type: opts.targetType ?? null,
        target_id: opts.targetId ?? null,
        ...opts.details,
      },
    });
  } catch (error) {
    console.warn("[Security] failed to record admin security event", error);
  }
}

async function upsertBalance(
  userId: string,
  asset: string,
  deltaAvailable: number,
  type:
    | "deposit"
    | "withdrawal"
    | "adjustment"
    | "fee"
    | "trade_buy"
    | "trade_sell"
    | "transfer",
  ref: { id: string; type: string } | null,
  note?: string,
) {
  const { data: existing } = await supabaseAdmin
    .from("balances")
    .select("available, locked")
    .eq("user_id", userId)
    .eq("asset", asset)
    .maybeSingle();
  const currentAvail = Number(existing?.available ?? 0);
  const currentLocked = Number(existing?.locked ?? 0);
  const newAvail = currentAvail + deltaAvailable;
  if (newAvail < 0) throw new Error("Balance would go negative");
  if (existing) {
    await supabaseAdmin
      .from("balances")
      .update({
        available: newAvail,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("asset", asset);
  } else {
    await supabaseAdmin.from("balances").insert({
      user_id: userId,
      asset,
      available: newAvail,
      locked: 0,
    });
  }
  await supabaseAdmin.from("transactions").insert({
    user_id: userId,
    asset,
    type,
    amount: deltaAvailable,
    balance_after: newAvail,
    reference_id: ref?.id ?? null,
    reference_type: ref?.type ?? null,
    note: note ?? null,
  });
  return { available: newAvail, locked: currentLocked };
}

// ============ DEPOSITS ============
export const reviewDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        deposit_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "hold"]),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { adminId, adminEmail } = await assertAdmin(
      context.userId,
      context.claims.email as string | undefined,
    );

    const { data: dep, error } = await supabaseAdmin
      .from("deposits")
      .select("*")
      .eq("id", data.deposit_id)
      .single();
    if (error || !dep) throw new Error("Deposit not found");
    if (dep.status !== "pending" && dep.status !== "hold")
      throw new Error(`Deposit already ${dep.status}`);

    if (data.decision === "approved") {
      await upsertBalance(
        dep.user_id,
        dep.asset,
        Number(dep.amount),
        "deposit",
        { id: dep.id, type: "deposit" },
        `Deposit approved by ${adminEmail ?? adminId}`,
      );
    }

    await supabaseAdmin
      .from("deposits")
      .update({
        status: data.decision,
        admin_note: data.note ?? null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", dep.id);

    await logAudit({
      actorId: adminId,
      actorEmail: adminEmail,
      action: `deposit.${data.decision}`,
      targetType: "deposit",
      targetId: dep.id,
      details: { amount: dep.amount, asset: dep.asset, user_id: dep.user_id },
    });
    return { ok: true };
  });

// ============ WITHDRAWALS ============
export const reviewWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        withdrawal_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "hold"]),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { adminId, adminEmail } = await assertAdmin(
      context.userId,
      context.claims.email as string | undefined,
    );

    const { data: w, error } = await supabaseAdmin
      .from("withdrawals")
      .select("*")
      .eq("id", data.withdrawal_id)
      .single();
    if (error || !w) throw new Error("Withdrawal not found");
    if (w.status !== "pending" && w.status !== "hold")
      throw new Error(`Withdrawal already ${w.status}`);

    const total = Number(w.amount) + Number(w.fee ?? 0);
    const { data: bal } = await supabaseAdmin
      .from("balances")
      .select("available, locked")
      .eq("user_id", w.user_id)
      .eq("asset", w.asset)
      .single();
    if (!bal) throw new Error("Balance row missing");

    if (data.decision === "approved") {
      // remove from locked (already deducted from available at submit time)
      const newLocked = Number(bal.locked) - total;
      if (newLocked < 0) throw new Error("Locked balance inconsistency");
      await supabaseAdmin
        .from("balances")
        .update({ locked: newLocked, updated_at: new Date().toISOString() })
        .eq("user_id", w.user_id)
        .eq("asset", w.asset);
      await supabaseAdmin.from("transactions").insert({
        user_id: w.user_id,
        asset: w.asset,
        type: "withdrawal",
        amount: -total,
        balance_after: Number(bal.available),
        reference_id: w.id,
        reference_type: "withdrawal",
        note: `Withdrawal approved by ${adminEmail ?? adminId}`,
      });
    } else if (data.decision === "rejected") {
      // unlock back to available
      const newLocked = Number(bal.locked) - total;
      const newAvail = Number(bal.available) + total;
      if (newLocked < 0) throw new Error("Locked balance inconsistency");
      await supabaseAdmin
        .from("balances")
        .update({
          locked: newLocked,
          available: newAvail,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", w.user_id)
        .eq("asset", w.asset);
    }
    // 'hold' leaves balance locked

    await supabaseAdmin
      .from("withdrawals")
      .update({
        status: data.decision,
        admin_note: data.note ?? null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", w.id);

    await logAudit({
      actorId: adminId,
      actorEmail: adminEmail,
      action: `withdrawal.${data.decision}`,
      targetType: "withdrawal",
      targetId: w.id,
      details: { amount: w.amount, asset: w.asset, user_id: w.user_id },
    });
    return { ok: true };
  });

// ============ ADJUST BALANCE ============
export const adjustBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        asset: z.string().min(2).max(10),
        delta: z.number().refine((v) => v !== 0, "delta must be non-zero"),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { adminId, adminEmail } = await assertAdmin(
      context.userId,
      context.claims.email as string | undefined,
    );
    await upsertBalance(
      data.user_id,
      data.asset,
      data.delta,
      "adjustment",
      null,
      data.note ?? `Adjusted by ${adminEmail ?? adminId}`,
    );
    await logAudit({
      actorId: adminId,
      actorEmail: adminEmail,
      action: "balance.adjust",
      targetType: "user",
      targetId: data.user_id,
      details: { asset: data.asset, delta: data.delta, note: data.note },
    });
    return { ok: true };
  });

// ============ USER STATUS ============
export const updateUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        status: z.enum(["active", "frozen", "banned"]).optional(),
        withdrawals_frozen: z.boolean().optional(),
        trading_frozen: z.boolean().optional(),
        kyc_level: z.enum(["none", "basic", "advanced"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { adminId, adminEmail } = await assertAdmin(
      context.userId,
      context.claims.email as string | undefined,
    );
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.status !== undefined) patch.status = data.status;
    if (data.withdrawals_frozen !== undefined)
      patch.withdrawals_frozen = data.withdrawals_frozen;
    if (data.trading_frozen !== undefined)
      patch.trading_frozen = data.trading_frozen;
    if (data.kyc_level !== undefined) patch.kyc_level = data.kyc_level;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch as never)
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    await logAudit({
      actorId: adminId,
      actorEmail: adminEmail,
      action: "user.update_status",
      targetType: "user",
      targetId: data.user_id,
      details: patch,
    });
    return { ok: true };
  });

// ============ GRANT / REVOKE ADMIN ============
export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ user_id: z.string().uuid(), grant: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { adminId, adminEmail } = await assertAdmin(
      context.userId,
      context.claims.email as string | undefined,
    );
    if (data.grant) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: "admin" }, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", "admin");
    }
    await logAudit({
      actorId: adminId,
      actorEmail: adminEmail,
      action: data.grant ? "role.grant_admin" : "role.revoke_admin",
      targetType: "user",
      targetId: data.user_id,
    });
    return { ok: true };
  });

// ============ ASSIGN DEPOSIT ADDRESS ============
export const assignDepositAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        asset: z.string().min(2).max(10),
        network: z.enum(["BTC", "ERC20", "TRC20", "BEP20", "SOL"]),
        address: z.string().min(4).max(200),
        memo: z.string().max(200).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { adminId, adminEmail } = await assertAdmin(
      context.userId,
      context.claims.email as string | undefined,
    );
    const { error } = await supabaseAdmin.from("wallet_addresses").upsert(
      {
        user_id: data.user_id,
        asset: data.asset,
        network: data.network,
        address: data.address,
        memo: data.memo ?? null,
        assigned_by: adminId,
      },
      { onConflict: "user_id,asset,network" },
    );
    if (error) throw new Error(error.message);
    await logAudit({
      actorId: adminId,
      actorEmail: adminEmail,
      action: "address.assign",
      targetType: "user",
      targetId: data.user_id,
      details: { asset: data.asset, network: data.network },
    });
    return { ok: true };
  });

// ============ MARKETS ============
export const updateMarket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "paused", "disabled"]).optional(),
        spread_bps: z.number().int().min(0).max(10000).optional(),
        maker_fee_bps: z.number().int().min(0).max(1000).optional(),
        taker_fee_bps: z.number().int().min(0).max(1000).optional(),
        max_leverage: z.number().int().min(1).max(200).optional(),
        liquidity_factor: z.number().min(0).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { adminId, adminEmail } = await assertAdmin(
      context.userId,
      context.claims.email as string | undefined,
    );
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("markets")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await logAudit({
      actorId: adminId,
      actorEmail: adminEmail,
      action: "market.update",
      targetType: "market",
      targetId: id,
      details: patch,
    });
    return { ok: true };
  });

// ============ BOOTSTRAP FIRST ADMIN (only when zero admins exist) ============
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error: ce } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if (ce) throw new Error(ce.message);
    if ((count ?? 0) > 0)
      throw new Error("An admin already exists");
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    await logAudit({
      actorId: context.userId,
      actorEmail: context.claims.email as string | undefined,
      action: "role.bootstrap_admin",
      targetType: "user",
      targetId: context.userId,
    });
    return { ok: true };
  });

// ============ ADMIN LIST QUERIES (use admin client to bypass RLS for joins) ============
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId, context.claims.email as string | undefined);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data;
  });
