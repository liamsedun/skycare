import { withAuth, ok, ValidationError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface SubscribeBody {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  } | null;
  deviceName?: string | null;
}

// POST /api/notifications/subscribe — store this device's push subscription
export const POST = withAuth(async (req, ctx) => {
  const body = (await req.json().catch(() => ({}))) as SubscribeBody;
  if (!body.endpoint || !body.endpoint.startsWith("https://")) {
    throw new ValidationError("Invalid push endpoint");
  }
  const keys = body.keys ?? null;
  if (!keys || !keys.p256dh || !keys.auth) {
    throw new ValidationError("Real browser subscriptions include p256dh and auth keys");
  }
  if (keys.p256dh.length < 40 || keys.auth.length < 10) {
    throw new ValidationError("Invalid push keys");
  }

  const subscriptionJson = { endpoint: body.endpoint, keys: keys ?? {} };

  const { error } = await ctx.svc.from("push_subscriptions").upsert(
    {
      user_id: ctx.user.id,
      endpoint: body.endpoint,
      subscription_json: subscriptionJson,
      device_name: body.deviceName?.trim() || null,
    },
    { onConflict: "endpoint", ignoreDuplicates: false }
  );
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "push_subscriptions",
    description: "Registered device for push notifications",
  });

  return ok({ subscribed: true });
});

export const runtime = "nodejs";