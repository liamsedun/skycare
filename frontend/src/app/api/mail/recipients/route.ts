import { withAuth, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/mail/recipients — staff users in this tenant (for compose), grouped staff/patients.
// Patient portal callers only see staff (they cannot message other patients).
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);

  const { data, error } = await ctx.svc
    .from("users")
    .select("id, email, full_name, role")
    .eq("tenant_id", tenantId)
    .order("full_name", { ascending: true });
  if (error) throw new ValidationError(error.message);

  const users = (data ?? []).filter((u: any) => u.id !== ctx.user.id);
  const staff = users.filter((u: any) => u.role !== "patient_api");
  const patients: any[] =
    ctx.role === "patient_api" ? [] : users.filter((u: any) => u.role === "patient_api");

  // Login-less dependants (no portal account) are still selectable: mail to them
  // is delivered to the family account holder's inbox.
  if (ctx.role !== "patient_api") {
    const { data: deps, error: depErr } = await ctx.svc
      .from("patients")
      .select("id, first_name, last_name, email, primary_account_id")
      .eq("tenant_id", tenantId)
      .eq("is_primary_account", false)
      .is("user_id", null)
      .eq("status", "active");
    if (depErr) throw new ValidationError(depErr.message);
    if (deps?.length) {
      const primIds = [...new Set(deps.map((d: any) => d.primary_account_id).filter(Boolean))];
      let primaryMap = new Map<string, { first_name: string; last_name: string; user_id: string | null }>();
      if (primIds.length) {
        const { data: prims } = await ctx.svc
          .from("patients")
          .select("id, first_name, last_name, user_id")
          .in("id", primIds);
        for (const p of prims ?? []) primaryMap.set(p.id, p);
      }
      for (const d of deps ?? []) {
        if (d.id === ctx.user.id) continue;
        const prim = primaryMap.get(d.primary_account_id);
        if (!prim?.user_id) continue; // no delivery path — skip
        patients.push({
          id: d.id,
          full_name: `${d.first_name} ${d.last_name}`.trim(),
          email: d.email ?? "",
          role: "patient_api",
          has_account: false,
          is_dependant: true,
          delivered_via: `${prim.first_name} ${prim.last_name}`.trim(),
        });
      }
    }

    // Login-less PRIMARY patients (no portal account) are also selectable: mail to
    // them is delivered to the first family member (dependant) with a portal login.
    // A primary with NO logged-in family member has no delivery path — listed but
    // marked no_path so the UI can flag it.
    const { data: primsNoLogin, error: pnlErr } = await ctx.svc
      .from("patients")
      .select("id, first_name, last_name, email")
      .eq("tenant_id", tenantId)
      .eq("is_primary_account", true)
      .is("user_id", null)
      .eq("status", "active");
    if (pnlErr) throw new ValidationError(pnlErr.message);
    if (primsNoLogin?.length) {
      const pnlIds = primsNoLogin.map((p: any) => p.id);
      const { data: fam } = await ctx.svc
        .from("patients")
        .select("id, first_name, last_name, user_id, primary_account_id")
        .eq("tenant_id", tenantId)
        .eq("is_primary_account", false)
        .not("user_id", "is", null)
        .in("primary_account_id", pnlIds);
      const famByPrim = new Map<string, Array<{ first_name: string; last_name: string; user_id: string | null }>>();
      for (const f of fam ?? []) {
        const arr = famByPrim.get(f.primary_account_id) ?? [];
        arr.push(f);
        famByPrim.set(f.primary_account_id, arr);
      }
      for (const p of primsNoLogin ?? []) {
        if (p.id === ctx.user.id) continue;
        const holders = famByPrim.get(p.id) ?? [];
        patients.push({
          id: p.id,
          full_name: `${p.first_name} ${p.last_name}`.trim(),
          email: p.email ?? "",
          role: "patient_api",
          has_account: false,
          is_primary: true,
          delivered_via: holders.length ? `${holders[0].first_name} ${holders[0].last_name}`.trim() : null,
          no_path: holders.length === 0,
        });
      }
    }
  }
  patients.sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));

  return ok({ staff, patients });
});

export const runtime = "nodejs";