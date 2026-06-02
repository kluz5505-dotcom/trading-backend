import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { securityEngine } from "@/lib/security-engine/server/engine";

/**
 * User-facing finance server functions.
 * Deposits: user submits, status=pending until admin approves.
 * Withdrawals: user submits, balance is LOCKED immediately, status=pending.
 */

const submitDepositInput = z.object({
  asset: z.string().min(2).max(10),
  network: z.enum(["BTC", "ERC20", "TRC20", "BEP20", "SOL"]),
  amount: z.number().positive().max(1_000_000_000),
  txid: z.string().min(4).max(200).optional().nullable(),
  proof_url: z.string().url().max(2000).optional().nullable(),
});

export const submitDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => submitDepositInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Ensure user has an assigned address for that asset/network
    const { data: addr, error: addrErr } = await supabaseAdmin
      .from("wallet_addresses")
      .select("address")
      .eq("user_id", userId)
      .eq("asset", data.asset)
      .eq("network", data.network)
      .maybeSingle();
    if (addrErr) throw new Error(addrErr.message);
    if (!addr)
      throw new Error(
        "No deposit address assigned. Please request one from support.",
      );

    const { data: dep, error } = await supabaseAdmin
      .from("deposits")
      .insert({
        user_id: userId,
        asset: data.asset,
        network: data.network,
        amount: data.amount,
        address: addr.address,
        txid: data.txid ?? null,
        proof_url: data.proof_url ?? null,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return dep;
  });

const submitWithdrawalInput = z.object({
  asset: z.string().min(2).max(10),
  network: z.enum(["BTC", "ERC20", "TRC20", "BEP20", "SOL"]),
  amount: z.number().positive().max(1_000_000_000),
  to_address: z.string().min(4).max(200),
  memo: z.string().max(200).optional().nullable(),
});

export const submitWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => submitWithdrawalInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Block if frozen
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("status, withdrawals_frozen")
      .eq("id", userId)
      .single();
    if (!profile) throw new Error("Profile not found");
    if (profile.status !== "active")
      throw new Error("Account not active");
    if (profile.withdrawals_frozen)
      throw new Error("Withdrawals are frozen for this account");

    // Asset config + fee
    const { data: asset } = await supabaseAdmin
      .from("assets")
      .select("withdrawal_enabled, min_withdrawal, withdrawal_fee")
      .eq("symbol", data.asset)
      .single();
    if (!asset?.withdrawal_enabled)
      throw new Error("Withdrawals disabled for this asset");
    if (Number(data.amount) < Number(asset.min_withdrawal))
      throw new Error(
        `Amount below minimum (${asset.min_withdrawal} ${data.asset})`,
      );

    const fee = Number(asset.withdrawal_fee ?? 0);
    const total = Number(data.amount) + fee;

    // Lock the balance: move from available -> locked
    const { data: bal } = await supabaseAdmin
      .from("balances")
      .select("available, locked")
      .eq("user_id", userId)
      .eq("asset", data.asset)
      .maybeSingle();
    if (!bal || Number(bal.available) < total)
      throw new Error("Insufficient balance");

    const { error: upErr } = await supabaseAdmin
      .from("balances")
      .update({
        available: Number(bal.available) - total,
        locked: Number(bal.locked) + total,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("asset", data.asset);
    if (upErr) throw new Error(upErr.message);

    const ip = getRequestHeader("x-forwarded-for") ?? null;
    const ua = getRequestHeader("user-agent") ?? null;

    const { data: w, error } = await supabaseAdmin
      .from("withdrawals")
      .insert({
        user_id: userId,
        asset: data.asset,
        network: data.network,
        amount: data.amount,
        fee,
        to_address: data.to_address,
        memo: data.memo ?? null,
        status: "pending",
        ip_address: ip ? ip.split(",")[0].trim() : null,
        user_agent: ua,
      })
      .select("*")
      .single();
    if (error) {
      // rollback lock
      await supabaseAdmin
        .from("balances")
        .update({
          available: Number(bal.available),
          locked: Number(bal.locked),
        })
        .eq("user_id", userId)
        .eq("asset", data.asset);
      throw new Error(error.message);
    }

    void securityEngine.evaluateWithdrawalRisk({
      userId,
      withdrawalId: w.id,
      asset: data.asset,
      amount: Number(data.amount),
      ipAddress: ip ? ip.split(",")[0].trim() : null,
      userAgent: ua,
    }).catch((error) => {
      console.warn("[Security] withdrawal risk scoring failed", error);
    });

    const { ip_address: _ip, ...rest } = w;
    return rest;
  });
