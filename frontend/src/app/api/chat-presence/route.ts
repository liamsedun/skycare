import { withAuth, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/chat-presence — heartbeat: mark me online (call every ~30s)
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { error } = await ctx.svc
    .from("chat_presence")
    .upsert(
      { user_id: ctx.user.id, tenant_id: tenantId, last_seen_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) throw new ValidationError(error.message);
  return ok({ online: true });
});

export const runtime = "nodejs";