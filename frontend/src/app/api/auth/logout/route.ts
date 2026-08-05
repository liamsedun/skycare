import { withAuth } from "@/lib/api-utils";
import { ok } from "@/lib/api-utils";
import { logAuth } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/auth/logout — ends the Supabase session and records the audit entry.
export const POST = withAuth(async (req, ctx) => {
  await logAuth(req, { id: ctx.user.id, tenantId: ctx.tenantId, role: ctx.role }, "logout");
  await ctx.supabase.auth.signOut();
  return ok({ ok: true });
});

export const runtime = "nodejs";
