// tenant-onboarding: create tenant (hospital) + main branch + first admin.
//
// POST  { name, slug, email, password, phone, plan }
// Creates: Supabase Auth user (first admin), public.users row, tenants row,
// branches row, and JWT app_metadata claims { tenant_id, role, branch_id }.
import { adminClient, corsHeaders } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }
  try {
    const { name, slug, email, password, fullName, phone, plan = "basic" } = await req.json();
    if (!name || !slug || !email || !password) {
      return json({ error: "name, slug, email, password required" }, 400);
    }

    const svc = adminClient();

    // 1. Create tenant + main branch (single transaction per request; service role bypasses RLS)
    const { data: tenant, error: te } = await svc
      .from("tenants")
      .insert({ name, slug, phone, plan, trial_ends_at: new Date(Date.now() + 30 * 864e5).toISOString() })
      .select()
      .single();
    if (te) return json({ error: te.message }, 409);

    const { data: branch } = await svc
      .from("branches")
      .insert({ tenant_id: tenant.id, name: `${name} Main`, code: "MAIN", is_main: true })
      .select()
      .single();

    // 2. Create auth user
    const { data: auth, error: ue } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "hospital_admin", tenant_id: tenant.id, branch_id: branch.id },
      user_metadata: { full_name: fullName },
    });
    if (ue) return json({ error: ue.message }, 409);

    // 3. Mirror into our users table
    const { error: me } = await svc.from("users").insert({
      id: auth.user.id,
      tenant_id: tenant.id,
      branch_id: branch.id,
      email,
      full_name: fullName || email,
      role: "hospital_admin",
      phone,
    });
    if (me) return json({ error: me.message }, 500);

    // 4. Staff record so Schedule Duty / Availability / Leave work for the admin
    const { data: staffRows } = await svc.from("staff").select("staff_number");
    let maxSeq = 0;
    for (const s of staffRows ?? []) {
      const m = String(s.staff_number).match(/STF-(\d+)/);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
    const { error: se } = await svc.from("staff").insert({
      tenant_id: tenant.id,
      branch_id: branch.id,
      user_id: auth.user.id,
      staff_number: `STF-${String(maxSeq + 1).padStart(4, "0")}`,
      department: "Administration",
      is_available: true,
    });
    if (se) return json({ error: se.message }, 500);

    return json({ ok: true, tenant, branch, subdomain: `https://${slug}.skycare.app` }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}