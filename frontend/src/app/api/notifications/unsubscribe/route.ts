import { withAuth, ok, ValidationError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/notifications/unsubscribe — remove a push subscription by endpoint
export const POST = withAuth(async (req, ctx) => {
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) throw new ValidationError("Missing endpoint");

  const { error } = await ctx.svc
    .from("push_subscriptions")
    .delete()
    .eq("user_id", ctx.user.id)
    .eq("endpoint", body.endpoint);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "push_subscriptions",
    description: "Unregistered device from push notifications",
  });

  return ok({ unsubscribed: true });
});

export const runtime = "nodejs";