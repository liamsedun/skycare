import { withStaff, ok } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/mail/unread-count — unread message count for the sidebar badge
export const GET = withStaff(async (req, ctx) => {
  const { count, error } = await ctx.svc
    .from("internal_message_recipients")
    .select("*", { count: "exact", head: true })
    .eq("recipient_id", ctx.user.id)
    .eq("is_read", false);
  if (error) return ok({ unread: 0 });
  return ok({ unread: count ?? 0 });
});

export const runtime = "nodejs";