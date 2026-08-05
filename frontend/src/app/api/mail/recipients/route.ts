import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/mail/recipients — staff users in this tenant (for compose), grouped staff/patients
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);

  const { data, error } = await ctx.svc
    .from("users")
    .select("id, email, full_name, role")
    .eq("tenant_id", tenantId)
    .order("full_name", { ascending: true });
  if (error) throw new ValidationError(error.message);

  const users = (data ?? []).filter((u: any) => u.id !== ctx.user.id);
  const staff = users.filter((u: any) => u.role !== "patient_api");
  const patients = users.filter((u: any) => u.role === "patient_api");

  return ok({ staff, patients });
});

export const runtime = "nodejs";