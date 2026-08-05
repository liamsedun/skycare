import {
  withAuth,
  ok,
  okPaginated,
  ValidationError,
  requireTenant,
  getPagination,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/mail/inbox?page=&pageSize= — messages sent to me (staff or patient portal user)
export const GET = withAuth(async (req, ctx) => {
  requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);

  const { data, count, error } = await ctx.svc
    .from("internal_message_recipients")
    .select(
      "id, message_id, is_read, read_at, internal_messages!internal_message_recipients_message_id_fkey(id, sender_id, subject, body, is_broadcast, broadcast_scope, created_at)",
      { count: "exact" }
    )
    .eq("recipient_id", ctx.user.id)
    .order("created_at", { ascending: false, referencedTable: "internal_messages" })
    .range(from, to);
  if (error) throw new ValidationError(error.message);

  const rows = data ?? [];
  const senderIds = [...new Set(rows.map((r: any) => r.internal_messages?.sender_id).filter(Boolean))];
  let senderMap: Record<string, any> = {};
  if (senderIds.length > 0) {
    const { data: senders } = await ctx.svc
      .from("users")
      .select("id, email, full_name, avatar_url, role")
      .in("id", senderIds);
    if (senders) senderMap = Object.fromEntries(senders.map((s: any) => [s.id, s]));
  }

  const enriched = rows.map((r: any) => ({
    recipientRowId: r.id,
    isRead: r.is_read,
    readAt: r.read_at,
    ...r.internal_messages,
    sender: senderMap[r.internal_messages?.sender_id] ?? null,
  }));

  return okPaginated(enriched, count ?? 0, page, pageSize);
});

interface SendMailBody {
  recipientIds?: string[];
  subject: string;
  body: string;
  broadcast?: boolean;
  broadcastScope?: "staff" | "all";
}

// POST /api/mail/inbox — send a message to one or more staff (or broadcast)
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as SendMailBody;
  const isPatient = ctx.role === "patient_api";

  if (!body.subject?.trim()) throw new ValidationError("Subject is required");
  if (!body.body?.trim()) throw new ValidationError("Message body is required");
  if (isPatient && body.broadcast) throw new ValidationError("Broadcast is not available to patient accounts");

  let recipientIds: string[] = [];
  if (body.broadcast) {
    const scope = body.broadcastScope ?? "staff";
    let q = ctx.svc.from("users").select("id").eq("tenant_id", tenantId);
    if (scope === "staff") q = q.neq("role", "patient_api");
    const { data: users } = await q;
    if (users) recipientIds = users.map((u: any) => u.id).filter((id: string) => id !== ctx.user.id);
  } else if (body.recipientIds?.length) {
    const unique = [...new Set(body.recipientIds)];
    let q = ctx.svc
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", unique);
    if (isPatient) q = q.neq("role", "patient_api");
    const { data: users } = await q;
    const valid = new Set((users ?? []).map((u: any) => u.id));
    recipientIds = unique.filter((id) => valid.has(id) && id !== ctx.user.id);
  }

  if (recipientIds.length === 0) throw new ValidationError("No valid recipients");

  const { data: msg, error } = await ctx.svc
    .from("internal_messages")
    .insert({
      tenant_id: tenantId,
      sender_id: ctx.user.id,
      subject: body.subject.trim(),
      body: body.body.trim(),
      is_broadcast: body.broadcast || false,
      broadcast_scope: body.broadcast ? (body.broadcastScope ?? "staff") : "staff",
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  const { error: recErr } = await ctx.svc.from("internal_message_recipients").insert(
    recipientIds.map((recipientId) => ({ message_id: msg.id, recipient_id: recipientId }))
  );
  if (recErr) throw new ValidationError(recErr.message);

  await notifyUsers(ctx.svc, {
    orgId: tenantId,
    userIds: recipientIds,
    type: "general",
    title: `New message: ${body.subject.trim()}`,
    message: body.body.trim().slice(0, 150),
    referenceType: "internal_message",
    referenceId: msg.id,
  });

  await logAudit(req, ctx, {
    action: "create",
    entityType: "internal_messages",
    entityId: msg.id,
    description: `Sent internal mail "${body.subject.trim()}" to ${recipientIds.length} recipient(s)`,
  });

  return ok(msg, 201);
});

export const runtime = "nodejs";