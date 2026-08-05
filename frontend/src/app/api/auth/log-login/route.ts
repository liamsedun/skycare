import { withAuth } from "@/lib/api-utils";
import { ok } from "@/lib/api-utils";
import { logAuth } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/auth/log-login — called after a successful client-side sign-in
// so the login audit entry + last_login_at are recorded.
export const POST = withAuth(async (req, ctx) => {
  await logAuth(req, { id: ctx.user.id, tenantId: ctx.tenantId, role: ctx.role }, "login");
  await ctx.svc
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", ctx.user.id);
  return ok({ ok: true });
});

export const runtime = "nodejs";
