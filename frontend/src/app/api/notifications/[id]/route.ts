import { withAuth, ok, NotFoundError } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// PUT /api/notifications/[id] — mark one of my notifications as read
export const PUT = withAuth(async (req, ctx) => {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  const id = segs[segs.length - 1]!;

  const { data: row, error: getErr } = await ctx.svc
    .from("notifications")
    .select("id")
    .eq("id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (getErr || !row) throw new NotFoundError("Notification not found");

  const { error } = await ctx.svc
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id);
  if (error) throw new NotFoundError(error.message);

  return ok({ ok: true });
});

// DELETE /api/notifications/[id] — remove one of my notifications
export const DELETE = withAuth(async (req, ctx) => {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  const id = segs[segs.length - 1]!;

  const { data: row, error: getErr } = await ctx.svc
    .from("notifications")
    .select("id")
    .eq("id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (getErr || !row) throw new NotFoundError("Notification not found");

  const { error } = await ctx.svc.from("notifications").delete().eq("id", id);
  if (error) throw new NotFoundError(error.message);

  return ok({ ok: true });
});

export const runtime = "nodejs";