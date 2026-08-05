import { withAuth, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function familyIds(ctx: any): Promise<string[]> {
  const { data: me } = await ctx.svc
    .from("patients")
    .select("id, primary_account_id")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!me) return [];
  const ids = new Set<string>();
  ids.add(me.id);
  if (me.primary_account_id) ids.add(me.primary_account_id);
  const { data: deps } = await ctx.svc
    .from("patients")
    .select("id")
    .eq("primary_account_id", me.id);
  for (const d of deps ?? []) ids.add(d.id);
  return Array.from(ids);
}

async function getChat(ctx: any, tenantId: string, chatId: string) {
  let query = ctx.svc
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .eq("tenant_id", tenantId);

  if (ctx.role === "patient_api") {
    const ids = await familyIds(ctx);
    if (ids.length === 0) return null;
    query = query.in("patient_id", ids);
  } else {
    if (ctx.role === "super_admin") {
      query = query.not("patient_id", "is", null);
    } else {
      query = query.eq("staff_user_id", ctx.user.id);
    }
  }

  const { data } = await query.maybeSingle();
  return data;
}

function chatIdFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 2];
}

// GET /api/chats/[chatId]/messages — thread for one conversation (marks incoming read)
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const chatId = chatIdFrom(req);
  const chat = await getChat(ctx, tenantId, chatId);
  if (!chat) throw new NotFoundError("Conversation not found");

  const { data, error } = await ctx.svc
    .from("chat_messages")
    .select("id, chat_id, sender_id, message, is_read, created_at, users!chat_messages_sender_id_fkey(id, full_name)")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw new ValidationError(error.message);

  await ctx.svc
    .from("chat_messages")
    .update({ is_read: true })
    .eq("chat_id", chatId)
    .neq("sender_id", ctx.user.id)
    .eq("is_read", false);

  return ok({ chat, messages: data ?? [] });
});

interface SendMessageBody {
  message: string;
}

// POST /api/chats/[chatId]/messages — send a message in a conversation
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const chatId = chatIdFrom(req);
  const chat = await getChat(ctx, tenantId, chatId);
  if (!chat) throw new NotFoundError("Conversation not found");

  const body = (await req.json()) as SendMessageBody;
  if (!body.message?.trim()) throw new ValidationError("Message is required");

  const { data: msg, error } = await ctx.svc
    .from("chat_messages")
    .insert({ chat_id: chatId, sender_id: ctx.user.id, message: body.message.trim() })
    .select("id, chat_id, sender_id, message, is_read, created_at")
    .single();
  if (error) throw new ValidationError(error.message);

  await ctx.svc
    .from("chats")
    .update({ last_message: body.message.trim(), last_sender_id: ctx.user.id, last_message_at: new Date().toISOString() })
    .eq("id", chatId);

  const isPatient = ctx.role === "patient_api";
  if (isPatient) {
    const { data: staff } = await ctx.svc
      .from("users")
      .select("id")
      .eq("id", chat.staff_user_id)
      .maybeSingle();
    if (staff) {
      await notifyUsers(ctx.svc, {
        orgId: tenantId,
        userIds: [staff.id],
        type: "chat_message",
        title: "New message from a patient",
        message: body.message.trim().slice(0, 150),
        referenceType: "chat",
        referenceId: chatId,
      });
    }
  } else {
    const { data: patient } = await ctx.svc
      .from("patients")
      .select("user_id")
      .eq("id", chat.patient_id)
      .maybeSingle();
    if (patient?.user_id) {
      await notifyUsers(ctx.svc, {
        orgId: tenantId,
        userIds: [patient.user_id],
        type: "chat_message",
        title: "New message from the hospital",
        message: body.message.trim().slice(0, 150),
        referenceType: "chat",
        referenceId: chatId,
      });
    }
  }

  return ok(msg, 201);
});

export const runtime = "nodejs";