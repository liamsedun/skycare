import { withAuth } from "@/lib/api-utils";
import { ok } from "@/lib/api-utils";
import { logAuth } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/auth/log-login — called after a successful client-side sign-in
// so the login audit entry + last_login_at are recorded. Also returns the
// account's is_active flag so the login page can gate deactivated accounts
// in the same round trip (no separate /api/auth/me call on the hot path).
export const POST = withAuth(async (req, ctx) => {
  await logAuth(req, { id: ctx.user.id, tenantId: ctx.tenantId, role: ctx.role }, "login");
  const { data: updated } = await ctx.svc
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", ctx.user.id)
    .select("is_active")
    .maybeSingle();
  return ok({ ok: true, is_active: updated?.is_active ?? null });
});

export const runtime = "nodejs";
