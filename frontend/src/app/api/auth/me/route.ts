import { withAuth } from "@/lib/api-utils";
import { ok } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/auth/me — current profile (user + tenant + patient family info)
export const GET = withAuth(async (req, ctx) => {
  const supabase = ctx.supabase;

  const [userRes, tenantRes, patientRes, staffRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", ctx.user.id).maybeSingle(),
    ctx.tenantId
      ? supabase.from("tenants").select("id, name, slug, logo_url, brand_color, settings").eq("id", ctx.tenantId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("patients")
      .select(
        "id, patient_number, first_name, last_name, gender, date_of_birth, is_primary_account, primary_account_id, dependant_relationship"
      )
      .eq("user_id", ctx.user.id)
      .maybeSingle(),
    supabase
      .from("staff")
      .select("id, staff_number, department, specialization, is_available")
      .eq("user_id", ctx.user.id)
      .maybeSingle(),
  ]);

  return ok({
    user: userRes.data,
    tenant: tenantRes.data,
    patient: patientRes.data,
    staff: staffRes.data,
    claims: {
      role: ctx.role,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
    },
  });
});

export const runtime = "nodejs";
