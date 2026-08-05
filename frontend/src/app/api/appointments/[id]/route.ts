import { withAuth, withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit, logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getAppointment(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("appointments")
    .select(
      "id, tenant_id, branch_id, patient_id, doctor_id, scheduled_date, start_time, end_time, type, status, reason, notes, created_by, created_at, patients(first_name, last_name, patient_number, phone), users(full_name, role)"
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

// GET /api/appointments/[id]
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const appointment = await getAppointment(ctx, id, tenantId);
  if (!appointment) throw new NotFoundError("Appointment not found");

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
    if (!ids.has(appointment.patient_id)) throw new NotFoundError("Appointment not found");
  }

  await logView(req, ctx, "appointments", appointment.id, "Viewed appointment");
  return ok(appointment);
});

// PUT /api/appointments/[id]
export const PUT = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getAppointment(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Appointment not found");

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = [
    "doctor_id", "scheduled_date", "start_time", "end_time", "type", "status", "reason", "notes",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  // Patients may only cancel their own appointments
  if (ctx.role === "patient_api") {
    const onlyCancel = Object.keys(patch).every((k) => k === "status") && patch.status === "cancelled";
    if (!onlyCancel) throw new ValidationError("You may only cancel an appointment");
  }

  const { data, error } = await ctx.svc
    .from("appointments")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "appointments",
    entityId: id,
    description: `Updated appointment status → ${patch.status ?? "changed"}`,
  });
  return ok(data);
});

// DELETE /api/appointments/[id] — staff cancels/removes
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getAppointment(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Appointment not found");

  await ctx.svc.from("appointments").delete().eq("id", id).eq("tenant_id", tenantId);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "appointments",
    entityId: id,
    description: "Deleted appointment",
  });
  return ok({ ok: true });
});

export const runtime = "nodejs";
