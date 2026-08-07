import { createServiceClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/verify/prescription/[id] — public verification endpoint. Returns
// the sealed snapshot (status, pharmacy routing, drugs, doctor, timestamps)
// from prescription_verify_snapshot() so the QR page can display the truth
// without exposing any session data.
export async function GET(req: NextRequest) {
  const routeSegments = req.nextUrl.pathname.split("/");
  const prescriptionId = routeSegments[routeSegments.length - 1];

  const svc = createServiceClient();
  const { data, error } = await svc.rpc("prescription_verify_snapshot", {
    p_prescription_id: prescriptionId,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return Response.json({ verified: false }, { status: 404 });
  }

  const row = data[0];
  return Response.json({
    verified: true,
    prescription_id: row.prescription_id,
    status: row.status,
    pharmacy_type: row.pharmacy_type,
    patient_name: row.patient_name,
    doctor_name: row.doctor_name,
    issued_at: row.issued_at,
    dispensed_at: row.dispensed_at,
    drugs: row.drugs ?? [],
  });
}