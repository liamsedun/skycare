import { withAuth, ok, requireTenant } from "@/lib/api-utils";
import { getPaystackKeys } from "@/lib/paystack";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/payments/gateway-status — tells the patient portal whether online
// payments are available for this tenant (no secrets are exposed).
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const keys = await getPaystackKeys(ctx.svc, tenantId);
  return ok({
    enabled: keys.configured,
    provider: keys.configured ? "paystack" : null,
    source: keys.configured ? keys.source : null,
    publicKeyMasked: keys.configured ? keys.publicKey?.slice(-4) : null,
  });
});

export const runtime = "nodejs";
