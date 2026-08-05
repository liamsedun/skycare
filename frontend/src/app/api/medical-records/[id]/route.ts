import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit, logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getRecord(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("medical_records")
    .select(
      "id, tenant_id, patient_id, visit_id, created_by, record_type, title, content, attachments, is_confidential, created_at, updated_at, patients(id, patient_number, first_name, last_name), users(id, full_name, role)"
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

// GET /api/medical-records/[id]
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const record = await getRecord(ctx, id, tenantId);
  if (!record) throw new NotFoundError("Record not found");
  await logView(req, ctx, "medical_records", id, `Viewed medical record "${record.title}"`);
  return ok(record);
});

// PUT /api/medical-records/[id]
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getRecord(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Record not found");

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = ["record_type", "title", "content", "is_confidential"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] ?? null;
  }

  const { data: updated, error } = await ctx.svc
    .from("medical_records")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "medical_records",
    entityId: id,
    description: `Updated medical record "${existing.title}"`,
  });

  return ok(updated);
});

// DELETE /api/medical-records/[id]
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getRecord(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Record not found");

  await ctx.svc.from("medical_records").delete().eq("id", id).eq("tenant_id", tenantId);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "medical_records",
    entityId: id,
    description: `Deleted medical record "${existing.title}"`,
  });
  return ok({ ok: true });
});

export const runtime = "nodejs";
