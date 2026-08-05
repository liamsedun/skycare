import { withStaff, ok, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// PUT /api/mail/[recipientRowId]/read — mark one of my received messages as read
export const PUT = withStaff(async (req, ctx) => {
  requireTenant(ctx);
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  const id = segs[segs.length - 2]!;

  const { data: row, error: getErr } = await ctx.svc
    .from("internal_message_recipients")
    .select("id")
    .eq("id", id)
    .eq("recipient_id", ctx.user.id)
    .maybeSingle();
  if (getErr || !row) throw new NotFoundError("Message not found");

  const { error } = await ctx.svc
    .from("internal_message_recipients")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new NotFoundError(error.message);

  return ok({ ok: true });
});

export const runtime = "nodejs";