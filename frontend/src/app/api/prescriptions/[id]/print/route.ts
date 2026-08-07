import { withStaff, ok, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PRINT_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, diagnosis, notes, status, pharmacy_type, external_pharmacy_name, dispensed_at, dispensed_by, issued_date, expires_date, created_at, patients(id, patient_number, first_name, last_name, date_of_birth, gender, primary_account_id), doctor_user:users!prescriptions_doctor_id_fkey(id, full_name, role), dispense_user:users!prescriptions_dispensed_by_fkey(id, full_name, role), prescription_items(id, drug_id, pharmacy_drug_id, medication_name, dosage, frequency, route, duration, quantity, refills, dispensed_qty, instructions)";

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

// GET /api/prescriptions/[id]/print — full bundle for the prescription PDF:
// tenant profile (name/logo/address/email/phone/currency), patient (+ main
// patient when the prescription is for a dependant), prescriber, dispenser,
// pharmacy routing (in-house vs external) and the medication lines.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const routeSegments = req.nextUrl.pathname.split("/");
  const prescriptionId = routeSegments[routeSegments.length - 2];

  const { data: rx, error: rxError } = await ctx.svc
    .from("prescriptions")
    .select(PRINT_SELECT)
    .eq("id", prescriptionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (rxError || !rx) throw new NotFoundError("Prescription not found");

  const patient = (rx.patients ?? null) as unknown as {
    id: string | null;
    patient_number: string | null;
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    gender: string | null;
    primary_account_id: string | null;
  } | null;
  const doctor = (rx.doctor_user ?? null) as unknown as { id: string; full_name: string; role: string } | null;
  const dispenser = (rx.dispense_user ?? null) as unknown as { id: string; full_name: string; role: string } | null;

  let mainPatient: { first_name: string; last_name: string; patient_number: string } | null = null;
  if (patient?.primary_account_id) {
    const { data: main } = await ctx.svc
      .from("patients")
      .select("first_name, last_name, patient_number")
      .eq("id", patient.primary_account_id)
      .maybeSingle();
    if (main) mainPatient = main;
  }

  const { data: tenant } = await ctx.svc
    .from("tenants")
    .select("name, logo_url, address, city, state, country, email, phone, currency")
    .eq("id", tenantId)
    .maybeSingle();

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

  await logView(req, ctx, "prescriptions", rx.id, "Printed prescription PDF");

  return ok({
    id: rx.id,
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
    doctor: doctor ? { name: doctor.full_name, role: doctor.role } : null,
    dispenser: dispenser ? { name: dispenser.full_name, role: dispenser.role } : null,
    items: (rx.prescription_items ?? []).map(
      (i: { medication_name: string | null; dosage: string; frequency: string; route: string | null; duration: string | null; quantity: number; refills: number; dispensed_qty: number; instructions: string | null }) => ({
        medication: i.medication_name,
        dosage: i.dosage,
        frequency: i.frequency,
        route: i.route,
        duration: i.duration,
        quantity: i.quantity,
        refills: i.refills,
        dispensedQty: i.dispensed_qty,
        instructions: i.instructions,
      })
    ),
    pharmacyType: rx.pharmacy_type,
    externalPharmacyName: rx.external_pharmacy_name,
    notes: rx.notes,
    status: rx.status,
    issuedAt: rx.issued_date,
    expiresAt: rx.expires_date,
    dispensedAt: rx.dispensed_at,
  });
});

export const runtime = "nodejs";