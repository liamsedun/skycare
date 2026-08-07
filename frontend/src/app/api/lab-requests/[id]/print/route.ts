import { withStaff, ok, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PRINT_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, status, is_external, external_lab_id, requested_at, completed_at, notes, created_by, completed_by, patients(id, patient_number, first_name, last_name, date_of_birth, gender, primary_account_id), doctor_user:users!lab_requests_doctor_id_fkey(id, full_name, role), completed_user:users!lab_requests_completed_by_fkey(id, full_name, role), lab_request_items(id, service_id, service_name, priority, sample_type, notes, result, result_unit, is_abnormal, reported_at)";

function getAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

// GET /api/lab-requests/[id]/print — full bundle for the lab request PDF:
// tenant profile (name/logo/address/email/phone/currency), patient (+ main
// patient when the request is for a dependant), requesting doctor, the lab
// clinician/technician who completed the testing, and the ordered services.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const routeSegments = req.nextUrl.pathname.split("/");
  const requestId = routeSegments[routeSegments.length - 2];

  const { data: labRequest, error: reqError } = await ctx.svc
    .from("lab_requests")
    .select(PRINT_SELECT)
    .eq("id", requestId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (reqError) throw new NotFoundError("Lab request not found");
  if (!labRequest) throw new NotFoundError("Lab request not found");

  // To-one embeds (patients, doctor_user) come back as objects at runtime even
  // though the generated types declare arrays — access them defensively.
  const patient = (labRequest.patients ?? null) as unknown as {
    id: string | null;
    patient_number: string | null;
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    gender: string | null;
    primary_account_id: string | null;
  } | null;
  const doctorUser = (labRequest.doctor_user ?? null) as unknown as { id: string; full_name: string; role: string } | null;

  // Main account holder when the request is for a dependant.
  let mainPatient: { first_name: string; last_name: string; patient_number: string } | null = null;
  if (patient?.primary_account_id) {
    const { data: main } = await ctx.svc
      .from("patients")
      .select("first_name, last_name, patient_number")
      .eq("id", patient.primary_account_id)
      .maybeSingle();
    if (main) mainPatient = main;
  }

  // The lab clinician/technician who carried out the testing.
  let technician: { id: string; full_name: string } | null = null;
  if (labRequest.completed_by) {
    const { data: tech } = await ctx.svc
      .from("users")
      .select("id, full_name")
      .eq("id", labRequest.completed_by)
      .maybeSingle();
    if (tech) technician = tech;
  }

  // The staff member who requested it (fallback requester name).
  let requester: { id: string; full_name: string } | null = null;
  if (labRequest.created_by) {
    const { data: requesterRow } = await ctx.svc
      .from("users")
      .select("id, full_name")
      .eq("id", labRequest.created_by)
      .maybeSingle();
    if (requesterRow) requester = requesterRow;
  }

  const { data: tenant } = await ctx.svc
    .from("tenants")
    .select("name, logo_url, address, city, state, country, email, phone, currency")
    .eq("id", tenantId)
    .maybeSingle();

  // Fetch the logo server-side and embed it as a base64 data URL so the
  // client-side PDF renderer never needs storage credentials.
  let logoDataUrl: string | null = null;
  if (tenant?.logo_url) {
    try {
      const logoRes = await fetch(tenant.logo_url, {
        headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}` },
        signal: AbortSignal.timeout(8000),
      });
      if (logoRes.ok) {
        const buf = Buffer.from(await logoRes.arrayBuffer());
        const type = logoRes.headers.get("content-type") ?? "image/png";
        if (buf.length > 0 && buf.length < 2 * 1024 * 1024) {
          logoDataUrl = `data:${type};base64,${buf.toString("base64")}`;
        }
      }
    } catch {
      /* logo optional */
    }
  }

  await logView(req, ctx, "lab_requests", labRequest.id, "Printed lab request PDF");

  return ok({
    id: labRequest.id,
    hospital: {
      name: tenant?.name ?? "Hospital",
      address: [tenant?.address, tenant?.city, tenant?.state, tenant?.country].filter(Boolean).join(", ") || null,
      email: tenant?.email ?? null,
      phone: tenant?.phone ?? null,
      currency: tenant?.currency ?? "NGN",
      logo: logoDataUrl,
    },
    patient: {
      id: patient?.id ?? null,
      name: patient ? `${patient.first_name} ${patient.last_name}` : "Unknown",
      patientNumber: patient?.patient_number ?? null,
      age: getAge(patient?.date_of_birth ?? null),
      gender: patient?.gender ? (patient.gender as string).replace(/^./, (c) => c.toUpperCase()) : null,
      isDependant: Boolean(patient?.primary_account_id),
      mainPatientName: mainPatient ? `${mainPatient.first_name} ${mainPatient.last_name}` : null,
    },
    doctor: doctorUser ? { name: doctorUser.full_name, role: doctorUser.role } : null,
    requester,
    technician,
    services: (labRequest.lab_request_items ?? []).map(
      (s: { service_name: string; priority: string; sample_type: string | null; notes: string | null; result?: string | null; result_unit?: string | null; is_abnormal?: boolean | null }) => ({
        name: s.service_name,
        priority: s.priority,
        sampleType: s.sample_type,
        notes: s.notes,
        result: s.result ?? null,
        resultUnit: s.result_unit ?? null,
        isAbnormal: s.is_abnormal ?? false,
      })
    ),
    isExternal: labRequest.is_external,
    externalLabId: labRequest.external_lab_id,
    notes: labRequest.notes,
    status: labRequest.status,
    requestedAt: labRequest.requested_at,
    completedAt: labRequest.completed_at,
  });
});

export const runtime = "nodejs";
