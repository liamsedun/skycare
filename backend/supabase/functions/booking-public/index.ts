// booking-public: anonymous booking from a hospital website.
//
// POST { tenantSlug, firstName, lastName, phone, date, time, reason }
// Validates the tenant, finds-or-creates the patient by phone, and inserts an
// appointment in 'scheduled' status. Service role so anon users never touch
// RLS-protected tables directly.
import { adminClient, corsHeaders } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }
  try {
    const body = await req.json();
    const { tenantSlug, firstName, lastName, phone, date, time, reason, branchId } = body;
    if (!tenantSlug || !firstName || !lastName || !phone || !date || !time) {
      return json({ error: "tenantSlug, firstName, lastName, phone, date, time required" }, 400);
    }

    const svc = adminClient();

    const { data: tenant, error: te } = await svc
      .from("tenants")
      .select("id, name")
      .eq("slug", tenantSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (te || !tenant) return json({ error: "Hospital not found" }, 404);

    // Find-or-create patient by phone (per tenant)
    const { data: existing } = await svc
      .from("patients")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("phone", phone)
      .maybeSingle();

    let patientId = existing?.id;
    if (!patientId) {
      const { data: last, error: le } = await svc
        .from("patients")
        .select("patient_number")
        .eq("tenant_id", tenant.id)
        .order("patient_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (le) return json({ error: le.message }, 500);

      const next = nextPatientNumber(last?.patient_number);
      const { data: created, error: pe } = await svc
        .from("patients")
        .insert({
          tenant_id: tenant.id,
          branch_id: branchId ?? null,
          primary_branch_id: branchId ?? null,
          patient_number: next,
          first_name: firstName,
          last_name: lastName,
          phone,
        })
        .select("id")
        .single();
      if (pe) return json({ error: pe.message }, 500);
      patientId = created.id;
    }

    const { data: appointment, error: ae } = await svc
      .from("appointments")
      .insert({
        tenant_id: tenant.id,
        branch_id: branchId ?? null,
        patient_id: patientId,
        scheduled_date: date,
        start_time: time,
        reason: reason ?? null,
        status: "scheduled",
      })
      .select()
      .single();
    if (ae) return json({ error: ae.message }, 500);

    return json({ ok: true, appointment, patientId }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function nextPatientNumber(current?: string): string {
  const n = current ? parseInt(current.replace(/\D/g, ""), 10) + 1 : 1;
  return `PT-${String(n).padStart(4, "0")}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}