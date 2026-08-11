import { withAuth, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PROCUREMENT_TEAM = ["hospital_admin", "super_admin", "pharmacist", "pharmacy_tech"];

// POST /api/pharmacy/procurement/purchase-orders/[id]/transition
// { status: "sent" | "approved" | "cancelled" } — engine state machine
export const POST = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const id = req.nextUrl.pathname.split("/").filter(Boolean).slice(-2)[0]!;
    const body = (await req.json()) as { status?: string };

    if (!body.status || !["sent", "approved", "cancelled"].includes(body.status)) {
      throw new ValidationError("status must be sent, approved or cancelled");
    }

    const { error } = await ctx.svc.rpc("pharmacy_po_transition", {
      p_tenant_id: tenantId,
      p_po_id: id,
      p_status: body.status,
      p_user_id: ctx.user.id,
    });
    if (error) throw new ValidationError(error.message);

    await logAudit(req, ctx, {
      action: "update",
      entityType: "pharmacy_purchase_orders",
      entityId: id,
      description: `Purchase order ${body.status}`,
    });
    return ok({ ok: true });
  },
  { roles: PROCUREMENT_TEAM as any }
);

export const runtime = "nodejs";
