import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { liveMarketEngine } from "./engine";

export const getPlatformLiveSnapshot = createServerFn({ method: "POST" })
  .handler(async ({ data }) => {
    const requestData = data as unknown as { symbols?: string[] } | undefined;
    const symbols = Array.isArray(requestData?.symbols) ? requestData.symbols : undefined;
    return liveMarketEngine.getSnapshot(symbols);
  });

export const getPlatformRealtimeStatus = createServerFn({ method: "POST" })
  .handler(() => liveMarketEngine.getStats());

export const getPlatformRealtimeNotifications = createServerFn({ method: "POST" })
  .handler(() => liveMarketEngine.getNotifications());

export const getUserRealtimeBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("balances")
      .select("*")
      .eq("user_id", context.userId)
      .order("asset");

    if (error) throw new Error(error.message);
    return data ?? [];
  });
