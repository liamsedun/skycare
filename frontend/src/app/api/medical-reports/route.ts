import {
  withAuth,
  ok,
  okPaginated,
  ValidationError,
  ForbiddenError,
  requireTenant,
  getPagination,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const READ_ROLES = ["hospital_admin", "super_admin", "doctor", "nurse"];
const WRITE_ROLES = ["hospital_admin", "super_admin", "doctor"];

async function familyPatientIds(ctx: any): Promise<string[]> {
  const { data: me } = await ctx.svc
    .from("patients")
    .select("id")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!me) return [];
  const { data: deps } = await ctx.svc
    .from("patients")
    .select("id")
    .eq("primary_account_id", me.id);
  return [me.id, ...(deps ?? []).map((d: any) => d.id)];
}

// GET /api/medical-reports?patient_id=&page=&pageSize=
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const patientIdParam = req.nextUrl.searchParams.get("patient_id");

  let patientId = patientIdParam;
  if (ctx.role === "patient_api") {
    const ids = await familyPatientIds(ctx);
    if (ids.length === 0) throw new ForbiddenError("No patient record linked to your account");
    if (patientId) {
      if (!ids.includes(patientId)) throw new ForbiddenError("You can only view your family's reports");
    } else {
      patientId = ids.join(",");
    }
  } else {
    if (!READ_ROLES.includes(ctx.role)) throw new ForbiddenError("Only clinical staff can view medical reports");
    if (!patientId) throw new ValidationError("patient_id is required");
  }

  let query = ctx.svc
    .from("medical_reports")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (ctx.role === "patient_api") {
    query = query.in("patient_id", patientId!.split(","));
  } else {
    query = query.eq("patient_id", patientId!);
  }

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

interface CreateReportBody {
  patientId: string;
  content: string;
  reportDate?: string;
  authorTitle?: string;
  referenceNumber?: string;
}

// POST /api/medical-reports — doctors/admins write reports
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!WRITE_ROLES.includes(ctx.role)) {
    throw new ForbiddenError("Only doctors and hospital admins can write medical reports");
  }

  const body = (await req.json()) as CreateReportBody;
  if (!body.patientId) throw new ValidationError("patient_id is required");
  if (!body.content?.trim()) throw new ValidationError("Report content is required");

  const { data: patient } = await ctx.svc
    .from("patients")
    .select("id, tenant_id")
    .eq("id", body.patientId)
    .maybeSingle();
  if (!patient || patient.tenant_id !== tenantId) {
    throw new ValidationError("Patient not found in your hospital");
  }

  const { data: authorRow } = await ctx.svc
    .from("users")
    .select("full_name")
    .eq("id", ctx.user.id)
    .maybeSingle();
  const authorName = authorRow?.full_name ?? ctx.user.user_metadata?.full_name ?? "Medical Officer";

  const { count } = await ctx.svc
    .from("medical_reports")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  const referenceNumber = body.referenceNumber || `MR-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data, error } = await ctx.svc
    .from("medical_reports")
    .insert({
      tenant_id: tenantId,
      patient_id: body.patientId,
      reference_number: referenceNumber,
      report_date: body.reportDate || new Date().toISOString().slice(0, 10),
      content: body.content.trim(),
      author_name: authorName,
      author_title: body.authorTitle?.trim() || null,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "medical_reports",
    entityId: data.id,
    description: `Wrote medical report ${referenceNumber}`,
  });

  return ok(data, 201);
});

export const runtime = "nodejs";