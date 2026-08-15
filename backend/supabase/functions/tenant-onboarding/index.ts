// tenant-onboarding: create tenant (hospital) + main branch + first admin.
//
// POST  { name, website?, email, password, phone, slug?, plan }
// slug is optional: when omitted it is auto-generated from the hospital name
// (prospective tenants never type it — their <slug>.skycare.app subdomain is
// assigned after signup). website = the hospital's own external site link.
// Creates: Supabase Auth user (first admin), tenants row, branches row,
// public.users row, staff row, and JWT app_metadata claims
// { tenant_id, role, branch_id }.
//
// Ordering matters: the auth user is created FIRST (the only step that can
// fail on a duplicate email) so a failed attempt leaves NOTHING behind; if any
// later step fails, previously created rows are rolled back explicitly.
import { adminClient, corsHeaders } from "../_shared/client.ts";

function generateSlug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "hospital-" + Date.now().toString(36);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }
  try {
    let { name, slug, website, email, password, fullName, phone, plan = "basic" } = await req.json();
    name = String(name ?? "").trim();
    if (!name) return json({ error: "hospital name is required" }, 400);
    if (!email || !password) {
      return json({ error: "name, email, password required" }, 400);
    }
    let websiteUrl = website ? String(website).trim() : null;
    if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) {
      return json({ error: "website must be a full URL starting with https:// or http://" }, 400);
    }
    if (websiteUrl && websiteUrl.length > 200) {
      return json({ error: "website link is too long" }, 400);
    }

    const svc = adminClient();

    // slug: explicit value (internal/testing only) or auto-generated from the name
    let finalSlug = String(slug ?? "").trim().toLowerCase();
    if (finalSlug && !/^[a-z0-9-]+$/.test(finalSlug)) {
      return json({ error: "slug may only contain lowercase letters, numbers and hyphens (e.g. liamsfields)" }, 400);
    }
    if (!finalSlug) {
      finalSlug = generateSlug(name);
      const { data: existing } = await svc.from("tenants").select("slug");
      const taken = new Set((existing ?? []).map((t) => t.slug));
      if (taken.has(finalSlug)) {
        let n = 2;
        while (taken.has(`${finalSlug}-${n}`)) n++;
        finalSlug = `${finalSlug}-${n}`;
      }
    }

    // 1. Auth user FIRST — duplicate emails fail here with nothing written.
    const { data: auth, error: ue } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (ue) return json({ error: ue.message }, 409);

    // 2. Tenant + main branch.
    const { data: tenant, error: te } = await svc
      .from("tenants")
      .insert({
        name,
        slug: finalSlug,
        website_url: websiteUrl,
        phone,
        plan,
        trial_ends_at: new Date(Date.now() + 30 * 864e5).toISOString(),
      })
      .select()
      .single();
    if (te) {
      await svc.auth.admin.deleteUser(auth.user.id);
      return json({ error: te.message }, 409);
    }

    const { data: branch, error: be } = await svc
      .from("branches")
      .insert({ tenant_id: tenant.id, name: `${name} Main`, code: "MAIN", is_main: true })
      .select()
      .single();
    if (be) {
      await svc.auth.admin.deleteUser(auth.user.id);
      await svc.from("tenants").delete().eq("id", tenant.id);
      return json({ error: be.message }, 500);
    }

    // 3. Mirror into our users table + set JWT claims.
    const { error: me } = await svc.from("users").insert({
      id: auth.user.id,
      tenant_id: tenant.id,
      branch_id: branch.id,
      email,
      full_name: fullName || email,
      role: "hospital_admin",
      phone,
    });
    if (me) {
      await svc.auth.admin.deleteUser(auth.user.id);
      await svc.from("tenants").delete().eq("id", tenant.id);
      return json({ error: me.message }, 500);
    }
    const { error: ce } = await svc.auth.admin.updateUserById(auth.user.id, {
      app_metadata: { role: "hospital_admin", tenant_id: tenant.id, branch_id: branch.id },
    });
    if (ce) {
      await svc.auth.admin.deleteUser(auth.user.id);
      await svc.from("tenants").delete().eq("id", tenant.id);
      return json({ error: ce.message }, 500);
    }

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
    if (se) {
      await svc.auth.admin.deleteUser(auth.user.id);
      await svc.from("tenants").delete().eq("id", tenant.id);
      return json({ error: se.message }, 500);
    }

    return json({ ok: true, tenant, branch, subdomain: `https://${finalSlug}.skycare.app` }, 201);
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