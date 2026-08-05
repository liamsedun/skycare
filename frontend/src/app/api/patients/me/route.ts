import { withAuth, ok, ForbiddenError, NotFoundError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/patients/me — patient portal helper: returns the caller's own patient
// record plus the family root and dependant list. Patient_api only.
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "patient_api") {
    throw new ForbiddenError("This endpoint is for patient portal accounts only");
  }

  const { data: self } = await ctx.svc
    .from("patients")
    .select("id, primary_account_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!self) throw new NotFoundError("Patient profile not found");

  const rootId = self.primary_account_id ?? self.id;

  const { data: family } = await ctx.svc
    .from("patients")
    .select("id, patient_number, first_name, last_name, gender, date_of_birth, phone, email, dependant_relationship, is_primary_account, status, user_id")
    .eq("tenant_id", tenantId)
    .or(`id.eq.${rootId},primary_account_id.eq.${rootId}`)
    .order("is_primary_account", { ascending: false })
    .order("created_at", { ascending: true });

  return ok({ selfId: self.id, rootId, family: family ?? [] });
});

export const runtime = "nodejs";
