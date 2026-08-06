import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getHost, loadTenant } from "@/lib/tenant";

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
 */
export async function POST(req: NextRequest) {
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

    // Resolve tenant from the request host (patient logs in on their hospital's subdomain).
    const { tenant } = await loadTenant(await getHost());
    if (!tenant) {
      return NextResponse.json(
        { error: "Could not identify your hospital. Use your email to sign in." },
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

    if (!patient?.user_id) {
      return NextResponse.json(
        { error: "No patient found with that number or phone. Check it and try again." },
        { status: 404 }
      );
    }

    const { data: authUser } = await svc.auth.admin.getUserById(patient.user_id);
    if (!authUser?.user?.email) {
      return NextResponse.json(
        { error: "This patient has no portal login. Ask the hospital to enable one." },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: { email: authUser.user.email.toLowerCase() } });
  } catch (e) {
    console.error("[resolve-identifier]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export const runtime = "nodejs";
