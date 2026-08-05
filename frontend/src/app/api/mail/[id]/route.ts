import {
  withAuth,
  ok,
  ValidationError,
  NotFoundError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// DELETE /api/mail/[id]?view=inbox|sent
// inbox (default): [id] is a recipient-row id — deletes MY copy only.
// sent:            [id] is a message id I sent — deletes the message (recipients cascade).
export const DELETE = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  const id = segs[segs.length - 1]!;
  const view = req.nextUrl.searchParams.get("view") ?? "inbox";

  if (view === "sent") {
    const { data: msg, error: getErr } = await ctx.svc
      .from("internal_messages")
      .select("id, subject")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("sender_id", ctx.user.id)
      .maybeSingle();
    if (getErr || !msg) throw new NotFoundError("Message not found");

    const { error } = await ctx.svc.from("internal_messages").delete().eq("id", id);
    if (error) throw new ValidationError(error.message);

    await logAudit(req, ctx, {
      action: "delete",
      entityType: "internal_messages",
      entityId: id,
      description: `Deleted sent mail "${msg.subject}"`,
    });
    return ok({ ok: true });
  }

  const { data: row, error: getErr } = await ctx.svc
    .from("internal_message_recipients")
    .select("id, internal_messages!internal_message_recipients_message_id_fkey(subject)")
    .eq("id", id)
    .eq("recipient_id", ctx.user.id)
    .maybeSingle();
  if (getErr || !row) throw new NotFoundError("Message not found");

  const { error } = await ctx.svc.from("internal_message_recipients").delete().eq("id", id);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "internal_message_recipients",
    entityId: id,
    description: `Deleted mail "${(row.internal_messages?.[0] as any)?.subject ?? ""}" from inbox`,
  });

  return ok({ ok: true });
});

export const runtime = "nodejs";