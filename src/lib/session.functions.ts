import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { securityEngine } from "@/lib/security-engine/server/engine";

/**
 * Records a login event for the current user with real IP / user-agent
 * captured server-side from the request.
 */
export const recordLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ipRaw = getRequestHeader("x-forwarded-for") ?? null;
    const ua = getRequestHeader("user-agent") ?? null;
    const ip = ipRaw ? ipRaw.split(",")[0].trim() : null;
    const sessionId = crypto.randomUUID();

    await supabaseAdmin.from("login_history").insert({
      user_id: context.userId,
      email: (context.claims.email as string | undefined) ?? null,
      ip_address: ip as never,
      user_agent: ua,
      event: "login",
    });

    await supabaseAdmin.from("user_sessions").insert({
      session_id: sessionId,
      user_id: context.userId,
      ip_address: ip as never,
      user_agent: ua,
      status: "active",
      login_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    });

    await securityEngine.detectSuspiciousLogin({
      userId: context.userId,
      sessionId,
      ipAddress: ip,
      userAgent: ua,
    }).catch((error) => {
      console.warn("[Security] suspicious login evaluation failed", error);
    });

    return { ok: true, sessionId };
  });
