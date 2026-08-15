import { withStaff, ok, ValidationError, NotFoundError, requireTenant, requireModuleLevel } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyInvoiceIssued } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/admissions/[id]/bill — post (or re-post) the ward room charge for a
// discharged admission that has no invoice yet — e.g. a daily rate was set after
// the discharge. Idempotent via ward_discharge_charges / invoices.admission_id.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "billing", "full");

  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  const admissionId = segs[segs.length - 2];

  const { data: adm } = await ctx.svc
    .from("admissions")
    .select("id, status")
    .eq("id", admissionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!adm) throw new NotFoundError("Admission not found");
  if (adm.status !== "discharged") {
    throw new ValidationError("Only discharged admissions can be billed");
  }

  const { data: ch, error: chError } = await ctx.svc.rpc("ward_discharge_charges", {
    p_tenant: tenantId,
    p_admission_id: admissionId,
    p_by: ctx.user.id,
  });
  if (chError) throw new ValidationError(chError.message);

  if (!ch) {
    return ok({
      charge: null,
      message: "No daily rate configured for this ward — set the rate in Ward rates first",
    });
  }

  const charge = {
    invoiceId: ch.invoice_id,
    invoiceNumber: ch.invoice_number,
    description: ch.description,
    charge: Number(ch.charge ?? 0),
    nights: Number(ch.nights ?? 0),
    rate: Number(ch.rate ?? 0),
    alreadyPosted: ch.already_posted === true,
  };

  if (!charge.alreadyPosted) {
    const { data: patientIdRow } = await ctx.svc
      .from("admissions")
      .select("patient_id")
      .eq("id", admissionId)
      .maybeSingle();
    await notifyInvoiceIssued(ctx.svc, tenantId, patientIdRow?.patient_id, ch.invoice_id, ch.invoice_number, Number(ch.charge ?? 0));
    await logAudit(req, ctx, {
      action: "create",
      entityType: "invoices",
      entityId: ch.invoice_id,
      changes: { charge, admission_id: admissionId },
      description: `Ward charges ${charge.invoiceNumber} (₦${charge.charge.toLocaleString()}) posted for discharged admission`,
    });
  }

  return ok({ charge });
});

export const runtime = "nodejs";