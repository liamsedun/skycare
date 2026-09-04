import { withAuth, ok, NotFoundError, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// DELETE /api/pharmacy/admin/prices/[id] — remove a price override
export const DELETE = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const segments = req.nextUrl.pathname.split("/");
    const id = segments[segments.length - 1];

    const { data: existing } = await ctx.svc.from("pharmacy_price_overrides").select("id").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
    if (!existing) throw new NotFoundError("Price override not found");

    const { error } = await ctx.svc.from("pharmacy_price_overrides").delete().eq("tenant_id", tenantId).eq("id", id);
    if (error) throw new ValidationError(error.message);
    return ok({ deleted: true });
  },
  { roles: ["hospital_admin"] }
);

export const runtime = "nodejs";