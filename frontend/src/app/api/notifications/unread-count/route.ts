import { withAuth, ok } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/notifications/unread-count — unread count for the bell badge
export const GET = withAuth(async (req, ctx) => {
  const { count, error } = await ctx.svc
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .eq("is_read", false);
  if (error) return ok({ unread: 0 });
  return ok({ unread: count ?? 0 });
});

export const runtime = "nodejs";