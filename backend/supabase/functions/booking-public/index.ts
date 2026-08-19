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

    // Notify the hospital's admins via Internal Mail (admin-only inbox).
    // Best effort: failures never fail the booking itself.
    try {
      const { data: admins } = await svc
        .from("users")
        .select("id")
        .eq("tenant_id", tenant.id)
        .in("role", ["hospital_admin", "super_admin"]);
      const { data: sender } = await svc
        .from("users")
        .select("id")
        .eq("email", "platform@skycare.app")
        .maybeSingle();
      if (sender && admins && admins.length > 0) {
        const lines = [
          `A new appointment was booked on the ${tenant.name} website.`,
          "",
          `Patient: ${firstName} ${lastName}`,
          `Phone: ${phone}`,
          `Date: ${date}`,
          `Time: ${time}`,
        ];
        if (branchId) lines.push(`Branch: ${branchId}`);
        if (reason) lines.push(`Reason: ${reason}`);

        const { data: msg } = await svc
          .from("internal_messages")
          .insert({
            tenant_id: tenant.id,
            sender_id: sender.id,
            subject: `New appointment booking — ${firstName} ${lastName}`,
            body: lines.join("\n"),
            is_broadcast: false,
            broadcast_scope: "staff",
          })
          .select("id")
          .single();

        if (msg) {
          await svc.from("internal_message_recipients").insert(
            admins.map((a: { id: string }) => ({ message_id: msg.id, recipient_id: a.id }))
          );
        }
      }
    } catch {
      /* mail fan-out is best-effort */
    }

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