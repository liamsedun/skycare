import { withStaff, ok, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

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

interface PatientShape {
  id: string; first_name: string; last_name: string; patient_number: string;
  date_of_birth: string | null; gender: string | null;
}
interface WardShape { id: string; name: string; ward_type: string | null; }
interface BedShape { id: string; bed_number: string; ward_id: string; ward?: WardShape | WardShape[] | null; }
interface DoctorShape { id: string; full_name: string; role: string; }
interface AdmissionBundle {
  id: string; tenant_id: string; bed_id: string | null; patient_id: string; visit_id: string | null;
  admitted_at: string; discharged_at: string | null; expected_discharge: string | null;
  admitting_doctor: string | null; status: string; diagnosis_at_admission: string | null; notes: string | null;
  patients?: PatientShape | PatientShape[] | null;
  beds?: BedShape | null;
  doctor_user?: DoctorShape | DoctorShape[] | null;
}

// GET /api/discharges/[admissionId] — the full discharge summary bundle for the
// client-side PDF renderer: tenant branding (logo base64), patient, admission
// window, ward/bed, diagnosis, medications, follow-up, attending clinician.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  const admissionId = segs[segs.length - 1];

  const { data: adm, error } = (await ctx.svc
    .from("admissions")
    .select(
      "id, tenant_id, bed_id, patient_id, visit_id, admitted_at, discharged_at, expected_discharge, " +
      "admitting_doctor, status, diagnosis_at_admission, notes, " +
      "patients(id, first_name, last_name, patient_number, date_of_birth, gender), " +
      "beds(ward_id, bed_number, ward(name, ward_type)), " +
      "doctor:users!admissions_admitting_doctor_fkey(id, full_name, role)"
    )
    .eq("id", admissionId)
    .eq("tenant_id", tenantId)
    .maybeSingle()) as unknown as {
    data: AdmissionBundle | null;
    error: { message?: string } | null;
  };
  if (error || !adm) throw new NotFoundError("Admission not found");
  const typedAdm = (Array.isArray(adm) ? adm[0] : adm) as AdmissionBundle;

  const { data: dch } = (await ctx.svc
    .from("discharges")
    .select("summary, medications, follow_up, discharged_by, discharged_at")
    .eq("admission_id", admissionId)
    .eq("tenant_id", tenantId)
    .maybeSingle()) as unknown as {
    data: { summary: string; medications: unknown[]; follow_up: string | null; discharged_by: string | null; discharged_at: string | null } | null;
    error: { message?: string } | null;
  };
  if (!dch) throw new NotFoundError("Discharge summary not found for this admission");

  let dischargedBy: DoctorShape | null = null;
  if (dch.discharged_by) {
    const { data: u } = (await ctx.svc
      .from("users")
      .select("full_name, role")
      .eq("id", dch.discharged_by)
      .maybeSingle()) as unknown as {
      data: { full_name: string; role: string } | null;
      error: { message?: string } | null;
    };
    if (u) dischargedBy = { id: dch.discharged_by, ...u };
  }

  const { data: rounds } = (await ctx.svc
    .from("ward_rounds")
    .select("notes, vitals, round_time, doctor_id")
    .eq("admission_id", admissionId)
    .eq("tenant_id", tenantId)
    .order("round_time", { ascending: false })
    .limit(30)) as unknown as {
    data: Array<{ notes: string | null; vitals: Record<string, unknown> | null; round_time: string; doctor_id: string | null }> | null;
    error?: { message?: string } | null;
  };

  const { data: tenant } = (await ctx.svc
    .from("tenants")
    .select("name, logo_url, address, city, state, country, email, phone, currency")
    .eq("id", tenantId)
    .maybeSingle()) as unknown as {
    data: { name: string; logo_url: string | null; address: string | null; city: string | null; state: string | null; country: string | null; email: string | null; phone: string | null; currency: string | null } | null;
    error?: { message?: string } | null;
  };

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
        if (buf.length > 0 && buf.length < 2 * 1024 * 1024) logoDataUrl = `data:${type};base64,${buf.toString("base64")}`;
      }
    } catch { /* logo optional */ }
  }

  await logView(req, ctx, "admissions", admissionId, "Printed discharge summary");

  const patient = Array.isArray(typedAdm.patients) ? typedAdm.patients[0] : typedAdm.patients;
  const doctor = Array.isArray(typedAdm.doctor_user) ? typedAdm.doctor_user[0] : typedAdm.doctor_user;
  const bed = typedAdm.beds ?? null;
  const wardArr = Array.isArray(bed?.ward) ? bed.ward[0] : bed?.ward;

  return ok({
    id: admissionId,
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
      gender: patient?.gender ? patient.gender.replace(/^./, (c) => c.toUpperCase()) : null,
    },
    ward: {
      name: wardArr?.name ?? "—",
      type: wardArr?.ward_type ?? null,
      bedNumber: bed?.bed_number ?? null,
    },
    visitId: typedAdm.visit_id,
    admittedAt: typedAdm.admitted_at,
    dischargedAt: dch.discharged_at ?? typedAdm.discharged_at,
    expectedDischarge: typedAdm.expected_discharge,
    diagnosis: typedAdm.diagnosis_at_admission,
    admissionNotes: typedAdm.notes,
    doctor: doctor ? { name: doctor.full_name, role: doctor.role } : null,
    dischargedBy,
    summary: dch.summary,
    medications: Array.isArray(dch.medications) ? dch.medications : [],
    followUp: dch.follow_up,
    rounds: (rounds ?? []).map((r) => ({
      at: r.round_time,
      vitals: r.vitals ?? {},
      notes: r.notes ?? null,
    })),
  });
});