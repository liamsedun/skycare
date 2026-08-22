import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getHost, loadTenant } from "@/lib/tenant";
import { rateLimit, API_IDENTIFIER, getClientIp, checkLockout, recordFailure } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/resolve-identifier
 * body: { identifier: string }
 *
 * Maps a patient's patient number or phone number to the auth email they
 * registered with, so the login form can sign them in with any of:
 *   - patient number (e.g. PT-0001)
 *   - phone number
 *   - email (passed through untouched)
 * Tenant is resolved from the request host header, so the same number can
 * exist in different hospitals without collision.
 *
 * SECURITY: Returns a unified error message for all "not found" cases
 * to prevent patient enumeration attacks.
 */
export const POST = rateLimit(async (req: NextRequest) => {
  try {
    const body = (await req.json()) as { identifier?: string };
    const identifier = body.identifier?.trim();
    if (!identifier) {
      return NextResponse.json({ error: "Identifier is required" }, { status: 400 });
    }

    // Email identifiers are used as-is.
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      return NextResponse.json({ data: { email: identifier.toLowerCase() } });
    }

    // Check lockout before proceeding
    const ip = getClientIp(req);
    const { locked, retryMs } = checkLockout(identifier, ip);
    if (locked) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Resolve tenant from the request host (patient logs in on their hospital's subdomain).
    const { tenant } = await loadTenant(await getHost());
    if (!tenant) {
      // Unified error — same as "patient not found" to prevent enumeration
      return NextResponse.json(
        { error: "No account found with that identifier. Check it and try again." },
        { status: 404 }
      );
    }

    const svc = createServiceClient();
    const { data: patient } = await svc
      .from("patients")
      .select("id, patient_number, phone, user_id")
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .or(`patient_number.eq.${identifier},phone.eq.${identifier}`)
      .maybeSingle();

    // Unified error — same message for "not found" and "found but no portal login"
    // This prevents attackers from distinguishing between valid and invalid identifiers.
    if (!patient?.user_id) {
      recordFailure(identifier, ip);
      return NextResponse.json(
        { error: "No account found with that identifier. Check it and try again." },
        { status: 404 }
      );
    }

    const { data: authUser } = await svc.auth.admin.getUserById(patient.user_id);
    if (!authUser?.user?.email) {
      recordFailure(identifier, ip);
      return NextResponse.json(
        { error: "No account found with that identifier. Check it and try again." },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: { email: authUser.user.email.toLowerCase() } });
  } catch (e) {
    console.error("[resolve-identifier]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}, API_IDENTIFIER);

export const runtime = "nodejs";
