import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { monitoringEngine } from "./server/engine";

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

export const getMonitoringTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [health, incidents, events] = await Promise.all([
      monitoringEngine.getPlatformHealth(),
      supabaseAdmin.from("incidents").select("*").order("created_at", { ascending: false }).limit(25),
      supabaseAdmin.from("monitoring_events").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    return {
      health,
      incidents: incidents.data ?? [],
      events: events.data ?? [],
    };
  });

export const getSecurityTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [securityEvents, fraudFlags] = await Promise.all([
      supabaseAdmin.from("security_events").select("*").order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("fraud_flags").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    return {
      securityEvents: securityEvents.data ?? [],
      fraudFlags: fraudFlags.data ?? [],
    };
  });
