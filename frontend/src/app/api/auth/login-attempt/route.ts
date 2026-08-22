import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getClientMeta } from "@/lib/audit";
import { checkLockout, recordFailure, resetLockout, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login-attempt
 * body: { identifier: string, success: boolean }
 *
 * Records login attempts for lockout tracking. Called by the login form
 * after signInWithPassword succeeds or fails. This is NOT a public endpoint
 * — it's called from the authenticated client after the attempt.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { identifier?: string; success?: boolean };
    const identifier = body.identifier?.trim();
    if (!identifier) {
      return NextResponse.json({ error: "Identifier required" }, { status: 400 });
    }

    const ip = getClientIp(req);
    const { ip_address, user_agent } = getClientMeta(req);

    if (body.success) {
      // Successful login — reset lockout for this identifier+IP
      resetLockout(identifier, ip);

      // Log successful login to security_events
      const svc = createServiceClient();
      await svc.from("security_events").insert({
        event_type: "login_success",
        severity: "info",
        description: `Successful login for ${identifier}`,
        ip_address,
        user_agent,
      });

      return NextResponse.json({ ok: true });
    }

    // Failed login — record and check lockout
    const { locked, retryMs } = recordFailure(identifier, ip);

    // Log failure to security_events
    const svc = createServiceClient();
    await svc.from("security_events").insert({
      event_type: "failed_login",
      severity: locked ? "high" : "warning",
      description: `Failed login for ${identifier}${locked ? ` — locked for ${Math.ceil(retryMs / 1000)}s` : ""}`,
      ip_address,
      user_agent,
      metadata: { identifier, locked, retryMs },
    });

    return NextResponse.json({ ok: true, locked, retryMs });
  } catch {
    // Never block the login flow on audit failures
    return NextResponse.json({ ok: true });
  }
}

export const runtime = "nodejs";
