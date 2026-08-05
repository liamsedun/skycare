import { withAuth, okPaginated, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/appointments?status=&from=&to=&doctor_id=&patient_id=&q=&page=&pageSize=
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const status = resolveParam(req.nextUrl.searchParams.get("status"));
  const dateFrom = resolveParam(req.nextUrl.searchParams.get("from"));
  const dateTo = resolveParam(req.nextUrl.searchParams.get("to"));
  const doctorId = resolveParam(req.nextUrl.searchParams.get("doctor_id"));
  const patientId = resolveParam(req.nextUrl.searchParams.get("patient_id"));
  const q = resolveParam(req.nextUrl.searchParams.get("q"))?.trim();

  let familyIds: string[] | null = null;
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
    if (ids.size === 0) return okPaginated([], 0, page, pageSize);
    familyIds = Array.from(ids);
  }

  let query = ctx.svc
    .from("appointments")
    .select(
      "id, tenant_id, branch_id, patient_id, doctor_id, scheduled_date, start_time, end_time, type, status, reason, notes, created_at, patients(first_name, last_name, patient_number), users!appointments_doctor_id_fkey(full_name, role)",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (dateFrom) query = query.gte("scheduled_date", dateFrom);
  if (dateTo) query = query.lte("scheduled_date", dateTo);
  if (doctorId) query = query.eq("doctor_id", doctorId);
  if (patientId) query = query.eq("patient_id", patientId);
  if (familyIds) query = query.in("patient_id", familyIds);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreateAppointmentBody {
  patientId: string;
  doctorId?: string;
  scheduledDate: string;
  startTime: string;
  endTime?: string;
  type?: string;
  status?: string;
  reason?: string;
  notes?: string;
}

// POST /api/appointments
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreateAppointmentBody;

  if (!body.patientId || !body.scheduledDate || !body.startTime) {
    throw new ValidationError("Patient, date and start time are required");
  }

  const { data: patient } = await ctx.svc
    .from("patients")
    .select("id, first_name, last_name, patient_number")
    .eq("id", body.patientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!patient) throw new NotFoundError("Patient not found");

  if (body.doctorId) {
    const { data: doctor } = await ctx.svc
      .from("users")
      .select("id, role")
      .eq("id", body.doctorId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!doctor || !["doctor", "hospital_admin"].includes(doctor.role)) {
      throw new ValidationError("Invalid doctor selected");
    }
  }

  const { data: appointment, error } = await ctx.svc
    .from("appointments")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      patient_id: body.patientId,
      doctor_id: body.doctorId ?? null,
      scheduled_date: body.scheduledDate,
      start_time: body.startTime,
      end_time: body.endTime || null,
      type: body.type || "in_person",
      status: body.status || "scheduled",
      reason: body.reason?.trim() || null,
      notes: body.notes?.trim() || null,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  // Notify the patient's portal account if they have one
  if (patient) {
    const { data: user } = await ctx.svc
      .from("patients")
      .select("user_id")
      .eq("id", patient.id)
      .maybeSingle();
    if (user?.user_id) {
      await notifyUsers(ctx.svc, {
        orgId: tenantId,
        userIds: [user.user_id],
        type: "appointment_reminder",
        title: "Appointment booked",
        message: `${body.scheduledDate} at ${body.startTime} — ${patient.first_name} ${patient.last_name}`,
        referenceType: "appointments",
        referenceId: appointment.id,
      });
    }
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "appointments",
    entityId: appointment.id,
    description: `Booked appointment for ${patient.first_name} ${patient.last_name} on ${body.scheduledDate} ${body.startTime}`,
  });
  return ok(appointment);
});

export const runtime = "nodejs";
