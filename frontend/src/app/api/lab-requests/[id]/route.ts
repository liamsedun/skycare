import { withAuth, withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit, logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const REQUEST_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, status, is_external, external_lab_id, requested_at, completed_at, notes, created_by, created_at, updated_at, patients(id, patient_number, first_name, last_name, phone, user_id), users!lab_requests_doctor_id_fkey(id, full_name, role), lab_request_items(id, service_id, service_name, priority, sample_type, notes)";

async function getRequest(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("lab_requests")
    .select(REQUEST_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

// GET /api/lab-requests/[id]
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const labRequest = await getRequest(ctx, id, tenantId);
  if (!labRequest) throw new NotFoundError("Lab request not found");

  if (ctx.role === "patient_api") {
    const { data } = await ctx.svc
      .from("patients")
      .select("id, primary_account_id")
      .eq("user_id", ctx.user.id);
    const ids = new Set<string>();
    for (const row of data ?? []) {
      ids.add(row.id);
      if (row.primary_account_id) ids.add(row.primary_account_id);
    }
    if (!ids.has(labRequest.patient_id)) throw new NotFoundError("Lab request not found");
  }

  await logView(req, ctx, "lab_requests", labRequest.id, "Viewed lab request");
  return ok(labRequest);
});

const STATUS_FLOW: Record<string, string[]> = {
  requested: ["sample_collected", "cancelled"],
  sample_collected: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// PATCH /api/lab-requests/[id] — status transitions + notes/external fields
export const PATCH = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getRequest(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Lab request not found");

  const body = (await req.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if ("status" in body) {
    const status = String(body.status);
    if (!(status in STATUS_FLOW)) throw new ValidationError("Invalid status");
    if (!STATUS_FLOW[existing.status].includes(status)) {
      throw new ValidationError(`Cannot change status from ${existing.status} to ${status}`);
    }
    patch.status = status;
    if (status === "completed") patch.completed_at = new Date().toISOString();
    if (status === "cancelled") patch.completed_at = null;
  }

  for (const key of ["notes", "is_external", "external_lab_id"]) {
    if (key in body) patch[key] = body[key];
  }

  const { data, error } = await ctx.svc
    .from("lab_requests")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "lab_requests",
    entityId: id,
    description: `Lab request status → ${patch.status ?? "updated"}`,
  });
  return ok(data);
});

// DELETE /api/lab-requests/[id] — staff removes the whole request (items cascade)
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getRequest(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Lab request not found");

  await ctx.svc.from("lab_requests").delete().eq("id", id).eq("tenant_id", tenantId);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "lab_requests",
    entityId: id,
    description: "Deleted lab request",
  });
  return ok({ ok: true });
});

export const runtime = "nodejs";
