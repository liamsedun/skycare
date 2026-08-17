import { withStaff, ok, err, ValidationError, requireTenant, requireModuleLevel, isAdminRole, ForbiddenError, parseBody } from "@/lib/api-utils";
import { logAudit, logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PLAN_VALUES = ["basic", "pro", "enterprise", "custom"] as const;
type SubscriptionAction = "activate" | "suspend" | "resume" | "cancel" | "change-plan";

// Transition map: current status -> allowed actions
const TRANSITIONS: Record<string, SubscriptionAction[]> = {
  trial: ["activate", "suspend", "cancel", "change-plan"],
  active: ["suspend", "cancel", "change-plan"],
  past_due: ["activate", "suspend", "cancel", "change-plan"],
  suspended: ["resume", "cancel", "change-plan"],
  cancelled: ["change-plan"],
};

const NEXT_STATUS: Record<string, string> = {
  activate: "active",
  suspend: "suspended",
  resume: "active",
  cancel: "cancelled",
};

// GET /api/subscription — tenant subscription & billing (staff with module grant)
export const GET = withStaff(async (req, ctx) => {
  await requireModuleLevel(ctx, "subscription");
  const tenantId = requireTenant(ctx);

  const [tenantRes, invoicesRes] = await Promise.all([
    ctx.svc
      .from("tenants")
      .select("id, name, slug, email, plan, currency, trial_ends_at, subscription_status, is_active, created_at")
      .eq("id", tenantId)
      .maybeSingle(),
    ctx.svc
      .from("subscription_invoices")
      .select("id, period_start, period_end, amount, currency, status, provider, provider_ref, created_at")
      .eq("tenant_id", tenantId)
      .order("period_start", { ascending: false })
      .limit(36),
  ]);

  if (!tenantRes.data) throw new ValidationError("Tenant not found");

  await logView(req, ctx, "tenants", tenantId, "Viewed subscription billing");

  return ok({ tenant: tenantRes.data, invoices: invoicesRes.data ?? [] });
});

// PUT /api/subscription — subscription lifecycle transitions (admins only)
export const PUT = withStaff(async (req, ctx) => {
  await requireModuleLevel(ctx, "subscription", "full");
  const tenantId = requireTenant(ctx);
  if (!isAdminRole(ctx.role)) throw new ForbiddenError("Admin access required");

  const body = await parseBody<{ action?: string; plan?: string }>(req);
  const action = body.action as SubscriptionAction | undefined;
  if (!action || !["activate", "suspend", "resume", "cancel", "change-plan"].includes(action)) {
    throw new ValidationError("Invalid action — use activate, suspend, resume, cancel or change-plan");
  }

  const { data: tenant, error: getErr } = await ctx.svc
    .from("tenants")
    .select("id, name, plan, subscription_status, trial_ends_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (getErr || !tenant) throw new ValidationError("Tenant not found");

  const current = tenant.subscription_status ?? "trial";

  if (action === "change-plan") {
    const plan = body.plan;
    if (!plan || !PLAN_VALUES.includes(plan as (typeof PLAN_VALUES)[number])) {
      throw new ValidationError(`Invalid plan — use ${PLAN_VALUES.join(", ")}`);
    }
    const { data, error } = await ctx.svc
      .from("tenants")
      .update({ plan })
      .eq("id", tenantId)
      .select("id, plan, subscription_status, trial_ends_at")
      .single();
    if (error) return err(error.message, 500);
    await logAudit(req, ctx, {
      action: "update",
      entityType: "tenants",
      entityId: tenantId,
      description: `Changed subscription plan to ${plan}`,
      changes: { from: tenant.plan, to: plan },
    });
    return ok({ tenant: data });
  }

  if (!TRANSITIONS[current]?.includes(action)) {
    throw new ValidationError(
      `Cannot ${action} a ${current} subscription`
    );
  }

  const next = NEXT_STATUS[action];
  // activating from trial/past_due clears the trial window
  const patch: Record<string, unknown> = { subscription_status: next };
  if (action === "activate" && current !== "active") patch.trial_ends_at = null;

  const { data, error } = await ctx.svc
    .from("tenants")
    .update(patch)
    .eq("id", tenantId)
    .select("id, plan, subscription_status, trial_ends_at, is_active")
    .single();
  if (error) return err(error.message, 500);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "tenants",
    entityId: tenantId,
    description: `Subscription ${current} → ${next}`,
    changes: { from: current, to: next },
  });

  return ok({ tenant: data });
});

export const runtime = "nodejs";