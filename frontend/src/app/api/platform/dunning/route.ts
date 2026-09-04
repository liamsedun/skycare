import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

// Execute dunning pipeline
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;

  // Find overdue tenants (past_due status)
  const { data: overdueTenants, error: oErr } = await svc
    .from("tenants")
    .select("id, name, subscription_status")
    .eq("subscription_status", "past_due");

  if (oErr) throw new ApiError(oErr.message, 500);
  if (!overdueTenants || overdueTenants.length === 0) {
    return ok({ warned: 0, suspended: 0, archived: 0, message: "No overdue subscriptions found" });
  }

  let warned = 0, suspended = 0, archived = 0;

  for (const tenant of overdueTenants) {
    // Get most recent dunning run for this tenant
    const { data: lastRun } = await svc
      .from("dunning_runs")
      .select("stage, executed_at")
      .eq("tenant_id", tenant.id)
      .order("executed_at", { ascending: false })
      .limit(1)
      .single();

    const now = new Date().toISOString();

    if (!lastRun) {
      // No previous run -> WARNING
      await svc.from("dunning_runs").insert({
        tenant_id: tenant.id, stage: "warning", executed_at: now,
        created_by: user.id,
        metadata: { tenant_name: tenant.name },
      });
      warned++;
    } else if (lastRun.stage === "warning") {
      // Previous was warning -> SUSPEND
      await svc.from("dunning_runs").insert({
        tenant_id: tenant.id, stage: "suspended", executed_at: now,
        created_by: user.id,
        metadata: { tenant_name: tenant.name },
      });
      // Actually suspend the tenant
      await svc.from("tenants").update({ subscription_status: "suspended" }).eq("id", tenant.id);
      suspended++;
    } else if (lastRun.stage === "suspended") {
      // Previous was suspended -> ARCHIVE (cancel)
      await svc.from("dunning_runs").insert({
        tenant_id: tenant.id, stage: "archived", executed_at: now,
        created_by: user.id,
        metadata: { tenant_name: tenant.name },
      });
      await svc.from("tenants").update({ subscription_status: "cancelled" }).eq("id", tenant.id);
      archived++;
    }
    // If lastRun.stage === 'archived', skip (already fully escalated)
  }

  // Audit
  await svc.from("platform_audit_logs").insert({
    action: "EXECUTE", entity_type: "dunning_runs", entity_id: null,
    user_id: user.id, user_email: user.email,
    description: `Executed dunning pipeline: ${warned} warned, ${suspended} suspended, ${archived} archived`,
  });

  return ok({ warned, suspended, archived, total: overdueTenants.length });
});

// List dunning runs (platform admin)
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const sp = req.nextUrl.searchParams;
  const tenantId = sp.get("tenant_id");

  let query = svc.from("dunning_runs").select("*, tenant:tenants(name)").order("executed_at", { ascending: false }).limit(100);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 500);
  return ok(data || []);
});
