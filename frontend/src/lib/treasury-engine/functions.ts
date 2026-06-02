import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { treasuryEngine } from "./server/engine";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const getTreasuryTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [summary, wallets, transfers, reserveAlerts] = await Promise.all([
      treasuryEngine.getTreasurySummary(),
      supabaseAdmin.from("treasury_wallets").select("*").order("updated_at", { ascending: false }).limit(25),
      supabaseAdmin.from("treasury_transfers").select("*").order("created_at", { ascending: false }).limit(25),
      treasuryEngine.getReserveAlerts(),
    ]);

    return {
      summary,
      wallets: wallets.data ?? [],
      transfers: transfers.data ?? [],
      reserveAlerts: reserveAlerts ?? [],
    };
  });
