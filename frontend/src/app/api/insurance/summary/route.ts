import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/insurance/summary
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);

  // Total claims by status
  const { data: allClaims } = await ctx.svc
    .from("hmo_claims")
    .select("id, status, encounter_type, total_billed, total_covered, total_co_pay, provider_id, created_at, processed_at")
    .eq("tenant_id", tenantId);

  const claims = allClaims ?? [];

  const totalClaims = claims.length;
  const pendingClaims = claims.filter((c) => ["draft", "pending", "submitted"].includes(c.status));
  const approvedClaims = claims.filter((c) => c.status === "approved");
  const partiallyApprovedClaims = claims.filter((c) => c.status === "partially_approved");
  const paidClaims = claims.filter((c) => c.status === "paid");
  const rejectedClaims = claims.filter((c) => c.status === "rejected");

  const totalBilled = claims.reduce((sum, c) => sum + Number(c.total_billed ?? 0), 0);
  const totalApproved = [...approvedClaims, ...partiallyApprovedClaims].reduce(
    (sum, c) => sum + Number(c.total_covered ?? 0),
    0
  );
  const totalPaid = paidClaims.reduce((sum, c) => sum + Number(c.total_covered ?? 0), 0);
  const totalRejected = rejectedClaims.reduce((sum, c) => sum + Number(c.total_billed ?? 0), 0);
  const totalPendingBilled = pendingClaims.reduce((sum, c) => sum + Number(c.total_billed ?? 0), 0);

  // Claims by provider
  const providerMap = new Map<string, { count: number; billed: number; covered: number }>();
  for (const c of claims) {
    const pid = c.provider_id;
    if (!pid) continue;
    const existing = providerMap.get(pid) ?? { count: 0, billed: 0, covered: 0 };
    existing.count++;
    existing.billed += Number(c.total_billed ?? 0);
    existing.covered += Number(c.total_covered ?? 0);
    providerMap.set(pid, existing);
  }

  // Resolve provider names
  const providerIds = [...providerMap.keys()];
  let providerNames: Record<string, string> = {};
  if (providerIds.length > 0) {
    const { data: providers } = await ctx.svc
      .from("insurance_providers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", providerIds);
    if (providers) {
      for (const p of providers) providerNames[p.id] = p.name;
    }
  }

  const claimsByProvider = [...providerMap.entries()].map(([id, stats]) => ({
    providerId: id,
    providerName: providerNames[id] ?? "Unknown",
    ...stats,
  }));

  // Average processing time (days between created_at and processed_at)
  const processedClaims = claims.filter((c) => c.processed_at);
  const avgProcessingDays =
    processedClaims.length > 0
      ? processedClaims.reduce((sum, c) => {
          const created = new Date(c.created_at).getTime();
          const processed = new Date(c.processed_at).getTime();
          return sum + (processed - created) / (1000 * 60 * 60 * 24);
        }, 0) / processedClaims.length
      : 0;

  // Claims by encounter type
  const encounterMap = new Map<string, number>();
  for (const c of claims) {
    const t = c.encounter_type ?? "other";
    encounterMap.set(t, (encounterMap.get(t) ?? 0) + 1);
  }
  const claimsByEncounterType = [...encounterMap.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return ok({
    totalClaims,
    pendingClaims: pendingClaims.length,
    approvedClaims: approvedClaims.length + partiallyApprovedClaims.length,
    paidClaims: paidClaims.length,
    rejectedClaims: rejectedClaims.length,
    totalBilled,
    totalApproved,
    totalPaid,
    totalRejected,
    totalPendingBilled,
    claimsByProvider,
    claimsByEncounterType,
    avgProcessingDays: Math.round(avgProcessingDays * 10) / 10,
  });
});

export const runtime = "nodejs";
