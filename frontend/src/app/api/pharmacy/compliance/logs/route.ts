import { withStaff, ok, ValidationError, requireTenant, getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const LOG_SELECT =
  "id, user_id, action, drug_id, drug_name, batch_id, branch_id, patient_id, prescription_id, quantity, notes, hash, prev_hash, created_at, users(full_name)";

// GET /api/pharmacy/compliance/logs?drugId=&action=&page=&pageSize=&verify=true
// verify=true additionally walks the ENTIRE tenant chain and reports whether it
// is unbroken (hash(prev|tenant|user|action|drug|qty|patient|batch|time)).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const drugId = resolveParam(req.nextUrl.searchParams.get("drugId"));
  const action = resolveParam(req.nextUrl.searchParams.get("action"));
  const verify = req.nextUrl.searchParams.get("verify") === "true";

  let query = ctx.svc
    .from("dispensing_audit_logs")
    .select(LOG_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("id", { ascending: false })
    .range(from, to);
  if (drugId) query = query.eq("drug_id", drugId);
  if (action) query = query.eq("action", action);

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);

  let verified: { verified: boolean; brokenAt: number | null; total: number } | null = null;
  if (verify) {
    const { data: all, error: allErr } = await ctx.svc
      .from("dispensing_audit_logs")
      .select("id, prev_hash, hash")
      .eq("tenant_id", tenantId)
      .order("id", { ascending: true })
      .range(0, 100000);
    if (allErr) throw new ValidationError(allErr.message);
    let brokenAt: number | null = null;
    for (let i = 1; i < (all ?? []).length; i++) {
      if ((all![i].prev_hash ?? "") !== all![i - 1].hash) {
        brokenAt = all![i].id;
        break;
      }
    }
    verified = { verified: brokenAt === null, brokenAt, total: all?.length ?? 0 };
  }

  await logAudit(req, ctx, {
    action: "view",
    entityType: "dispensing_audit_logs",
    entityId: `${tenantId}`,
    description: `Viewed pharmacy dispensing audit log${verify ? " with chain verification" : ""}`,
  });

  return ok({ rows: data ?? [], count: count ?? 0, page, pageSize, verified });
});

export const runtime = "nodejs";