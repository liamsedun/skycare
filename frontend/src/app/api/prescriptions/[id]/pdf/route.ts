import { withAuth, ok, NotFoundError, requireTenant } from "@/lib/api-utils";
import { generatePrescriptionPdf } from "@/lib/prescription-pdf";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// verified for staff and patient portal accounts alike — the PDF is the
// patient's own data, and staff print/pharmacy workflows need the same file.

// POST /api/prescriptions/[id]/pdf — (re)generate and store the prescription
// PDF, returns the public storage URL.
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const routeSegments = req.nextUrl.pathname.split("/");
  const prescriptionId = routeSegments[routeSegments.length - 2];

  const result = await generatePrescriptionPdf(ctx.svc, tenantId, prescriptionId, req.nextUrl.origin);
  if (!result) throw new NotFoundError("Prescription not found");

  return NextResponse.json({ url: result.url, path: result.path }, { status: 201 });
});

// GET /api/prescriptions/[id]/pdf — stored URL, or 404 when not yet generated.
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const routeSegments = req.nextUrl.pathname.split("/");
  const prescriptionId = routeSegments[routeSegments.length - 2];

  const { data: rx, error } = await ctx.svc
    .from("prescriptions")
    .select("id, pdf_url")
    .eq("id", prescriptionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !rx) throw new NotFoundError("Prescription not found");
  if (!rx.pdf_url) throw new NotFoundError("Prescription PDF has not been generated yet");

  return NextResponse.json({ url: rx.pdf_url });
});

export const runtime = "nodejs";