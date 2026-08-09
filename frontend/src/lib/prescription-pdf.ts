import QRCode from "qrcode";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type React from "react";

/**
 * Server-side prescription PDF pipeline:
 *
 *   1. loads the same bundle the print endpoint serves (hospital profile,
 *      patient/dependant, doctor, dispenser, items)
 *   2. renders PrescriptionDocument to a PDF buffer with @react-pdf/renderer
 *   3. stamps a QR code pointing at /verify/prescription/{id}
 *   4. uploads {tenantId}/{prescriptionId}.pdf to the prescription-pdfs bucket
 *   5. records pdf_url on the prescription and notifies staff + patient
 *
 * Called on demand (POST print) and automatically after a full dispense.
 */

const BUNDLE_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, diagnosis, notes, status, pharmacy_type, external_pharmacy_name, dispensed_at, dispensed_by, issued_date, expires_date, created_at, patients(id, patient_number, first_name, last_name, date_of_birth, gender, primary_account_id), doctor_user:users!prescriptions_doctor_id_fkey(id, full_name, role), dispense_user:users!prescriptions_dispensed_by_fkey(id, full_name, role), prescription_items(id, pharmacy_drug_id, medication_name, dosage, frequency, route, duration, quantity, refills, dispensed_qty, instructions)";

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

function money(n: number, currency: string): string {
  const formatted = n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency === "NGN" ? `₦${formatted}` : `${currency} ${formatted}`;
}

export interface PrescriptionPdfBundle {
  id: string;
  hospital: {
    name: string;
    address: string | null;
    email: string | null;
    phone: string | null;
    currency: string;
    logo: string | null;
  };
  patient: {
    id: string | null;
    name: string;
    patientNumber: string | null;
    age: number | null;
    gender: string | null;
    isDependant: boolean;
    mainPatientName: string | null;
  };
  doctor: { name: string; role: string } | null;
  dispenser: { name: string; role: string } | null;
  items: Array<{
    medication: string | null;
    dosage: string;
    frequency: string;
    route: string | null;
    duration: string | null;
    quantity: number;
    refills: number;
    dispensedQty: number;
    unitPrice: number;
    instructions: string | null;
  }>;
  pharmacyType: string;
  externalPharmacyName: string | null;
  notes: string | null;
  status: string;
  issuedAt: string | null;
  expiresAt: string | null;
  dispensedAt: string | null;
  totalCost: number;
  totalCostLabel: string;
}

async function loadBundle(
  svc: SupabaseClient,
  tenantId: string,
  prescriptionId: string
): Promise<PrescriptionPdfBundle | null> {
  const { data: rx, error } = await svc
    .from("prescriptions")
    .select(BUNDLE_SELECT)
    .eq("id", prescriptionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !rx) return null;

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
    const { data: main } = await svc
      .from("patients")
      .select("first_name, last_name, patient_number")
      .eq("id", patient.primary_account_id)
      .maybeSingle();
    if (main) mainPatient = main;
  }

  const { data: tenant } = await svc
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

  // unit prices from the pharmacy catalog (whether or not an item is linked)
  const drugIds = (rx.prescription_items ?? [])
    .map((it: { pharmacy_drug_id: string | null }) => it.pharmacy_drug_id)
    .filter((id: string | null): id is string => Boolean(id));
  const priceMap = new Map<string, number>();
  if (drugIds.length > 0) {
    const { data: priced } = await svc
      .from("pharmacy_drugs")
      .select("id, unit_price")
      .in("id", drugIds);
    for (const d of priced ?? []) priceMap.set(d.id, d.unit_price ?? 0);
  }

  const items = (rx.prescription_items ?? []).map(
    (it: { medication_name: string | null; dosage: string; frequency: string; route: string | null; duration: string | null; quantity: number; refills: number; dispensed_qty: number; pharmacy_drug_id: string | null; instructions: string | null }) => ({
      medication: it.medication_name,
      dosage: it.dosage,
      frequency: it.frequency,
      route: it.route,
      duration: it.duration,
      quantity: it.quantity,
      refills: it.refills,
      dispensedQty: it.dispensed_qty,
      unitPrice: priceMap.get(it.pharmacy_drug_id ?? "") ?? 0,
      instructions: it.instructions,
    })
  );

  const totalCost = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);

  return {
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
    items,
    pharmacyType: rx.pharmacy_type,
    externalPharmacyName: rx.external_pharmacy_name,
    notes: rx.notes,
    status: rx.status,
    issuedAt: rx.issued_date,
    expiresAt: rx.expires_date,
    dispensedAt: rx.dispensed_at,
    totalCost,
    totalCostLabel: money(totalCost, tenant?.currency ?? "NGN"),
  };
}

/** Render the PDF document to a Buffer (Node side). */
async function renderPrescriptionBuffer(bundle: PrescriptionPdfBundle, qrDataUrl: string): Promise<Buffer> {
  const [{ pdf, Font }, { createElement }, { default: PrescriptionDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("react"),
    import("@/components/pdf/PrescriptionDocument"),
  ]);

  // DejaVu Sans covers the Naira sign (U+20A6), which Helvetica does not —
  // without it the amount renders as a broken-bar "¦". All four variants are
  // registered because the document mixes bold and italic styles.
  const fontDir = path.join(process.cwd(), "public", "fonts");
  const registered = Font.getRegisteredFontFamilies?.() ?? [];
  if (!registered.includes("DejaVuSans")) {
    Font.register({
      family: "DejaVuSans",
      fonts: [
        { src: path.join(fontDir, "DejaVuSans.ttf"), fontWeight: "normal", fontStyle: "normal" },
        { src: path.join(fontDir, "DejaVuSans-Bold.ttf"), fontWeight: "bold", fontStyle: "normal" },
        { src: path.join(fontDir, "DejaVuSans-Oblique.ttf"), fontWeight: "normal", fontStyle: "italic" },
        { src: path.join(fontDir, "DejaVuSans-BoldOblique.ttf"), fontWeight: "bold", fontStyle: "italic" },
      ],
    });
  }

  const data = { ...bundle, qrCode: qrDataUrl, totalCostLabel: bundle.totalCostLabel };
  const element = createElement(PrescriptionDocument as React.ComponentType<{ data: unknown }>, { data });
  const rendered = pdf(element as never);
  // v4: toBuffer() resolves to a readable stream, not a Buffer
  const stream = (await rendered.toBuffer()) as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(
      typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array)
    );
  }
  return Buffer.concat(chunks);
}

/**
 * Generate (or re-generate) the stored prescription PDF and attach it to the
 * prescription row. Returns the public URL, or null when the prescription is
 * not found / not renderable.
 */
export async function generatePrescriptionPdf(
  svc: SupabaseClient,
  tenantId: string,
  prescriptionId: string,
  baseUrl: string
): Promise<{ url: string; path: string } | null> {
  const bundle = await loadBundle(svc, tenantId, prescriptionId);
  if (!bundle) return null;

  const verifyUrl = `${baseUrl.replace(/\/$/, "")}/verify/prescription/${prescriptionId}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 200, margin: 1, errorCorrectionLevel: "M" });

  const buffer = await renderPrescriptionBuffer(bundle, qrDataUrl);
  const path = `${tenantId}/${prescriptionId}.pdf`;

  const { error: upErr } = await svc.storage
    .from("prescription-pdfs")
    .upload(path, buffer, { upsert: true, contentType: "application/pdf" });
  if (upErr) throw new Error(`PDF upload failed: ${upErr.message}`);

  const { data: { publicUrl } } = svc.storage.from("prescription-pdfs").getPublicUrl(path);

  await svc.from("prescriptions").update({ pdf_url: publicUrl }).eq("id", prescriptionId).eq("tenant_id", tenantId);

  await notifyPdfAvailable(svc, tenantId, prescriptionId, publicUrl);

  return { url: publicUrl, path };
}

/**
 * Attach the PDF to internal messaging (staff users) and patient
 * notifications: one row per staff member tracking prescriptions (pharmacy +
 * prescriber) and one for the patient.
 */
async function notifyPdfAvailable(
  svc: SupabaseClient,
  tenantId: string,
  prescriptionId: string,
  pdfUrl: string
): Promise<void> {
  // staff: pharmacists, hospital admins, and the prescribing doctor
  const { data: rx } = await svc
    .from("prescriptions")
    .select("doctor_id, patient_id")
    .eq("id", prescriptionId)
    .maybeSingle();
  if (!rx) return;

  const { data: staffRows } = await svc
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("role", ["pharmacist", "hospital_admin"])
    .eq("is_active", true);
  const staffIds = staffRows?.map((u: { id: string }) => u.id) ?? [];
  if (rx.doctor_id) staffIds.push(rx.doctor_id);

  if (staffIds.length > 0) {
    const uniqueStaff = [...new Set(staffIds)];
    const senderId = rx.doctor_id ?? uniqueStaff[0];

const { data: msg } = await svc
      .from("internal_messages")
      .insert({
        tenant_id: tenantId,
        sender_id: senderId,
        subject: "Prescription PDF generated",
        body: `The prescription PDF is ready for the pharmacy record: ${pdfUrl}`,
        is_broadcast: false,
        broadcast_scope: "staff",
        attachments: [pdfUrl],
      })
      .select("id")
      .single();
    if (msg) {
      await svc
        .from("internal_message_recipients")
        .insert(
          uniqueStaff
            .filter((id: string) => id !== senderId)
            .map((recipientId: string) => ({ message_id: msg.id, recipient_id: recipientId }))
        );
      if (uniqueStaff.includes(senderId)) {
        await svc.from("internal_message_recipients").insert({
          message_id: msg.id,
          recipient_id: senderId,
          is_read: true,
          read_at: new Date().toISOString(),
        });
      }
    }

    await svc.from("notifications").insert(
      uniqueStaff.map((userId: string) => ({
        tenant_id: tenantId,
        user_id: userId,
        channel: "in_app",
        event: "prescription_pdf",
        title: "Prescription PDF available",
        message: `Prescription PDF ready: ${pdfUrl}`.slice(0, 150),
        reference_type: "prescriptions",
        reference_id: prescriptionId,
        status: "sent",
      }))
    );
  }

  // patient (dependant → primary account holder)
  const { data: patient } = await svc
    .from("patients")
    .select("primary_account_id")
    .eq("id", rx.patient_id)
    .maybeSingle();
  if (patient) {
    await svc.from("notifications").insert({
      tenant_id: tenantId,
      patient_id: patient.primary_account_id ?? rx.patient_id,
      channel: "in_app",
      event: "prescription_pdf",
      title: "Your prescription PDF",
      message: `Download your prescription PDF: ${pdfUrl}`,
      reference_type: "prescriptions",
      reference_id: prescriptionId,
      status: "sent",
    });
  }
}