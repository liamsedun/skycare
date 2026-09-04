import { withAuth, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"];
const AUDIO_TYPES = ["audio/mpeg", "audio/mp4", "audio/mp3", "audio/wav", "audio/webm", "audio/ogg", "audio/x-m4a", "audio/aac", "audio/3gpp"];
const DOC_TYPES = ["application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/rtf", "text/csv"];

const ALLOWED = new Set([...IMAGE_TYPES, ...AUDIO_TYPES, ...DOC_TYPES]);

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
    // A staff member participates in patient chats (staff_user_id) and
    // staff-to-staff chats (either staff_user_id or other_staff_user_id).
    query = query.or(`staff_user_id.eq.${ctx.user.id},other_staff_user_id.eq.${ctx.user.id}`);
  }

  const { data } = await query.maybeSingle();
  return data;
}

function chatIdFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 2];
}

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return cleaned || "attachment";
}

// POST /api/chats/[chatId]/attachments — upload a photo/document/voice note (max 3 MB, no video)
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const chatId = chatIdFrom(req);
  const chat = await getChat(ctx, tenantId, chatId);
  if (!chat) throw new NotFoundError("Conversation not found");

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new ValidationError("No file provided");

  if (file.type.startsWith("video/")) throw new ValidationError("Video uploads are not allowed");
  if (!ALLOWED.has(file.type)) {
    throw new ValidationError("Only images, documents or voice notes are allowed");
  }
  if (file.size > MAX_BYTES) throw new ValidationError("File must be 3 MB or smaller");

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `chats/${tenantId}/${chatId}/${Date.now()}-${sanitizeName(file.name)}.${ext}`;

  const { error: uploadError } = await ctx.svc.storage
    .from("chat-attachments")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (uploadError) throw new ValidationError(uploadError.message);

  const { data: { publicUrl } } = ctx.svc.storage.from("chat-attachments").getPublicUrl(path);

  const { data: msg, error } = await ctx.svc
    .from("chat_messages")
    .insert({
      chat_id: chatId,
      sender_id: ctx.user.id,
      message: null,
      attachment_url: publicUrl,
      attachment_name: file.name,
      attachment_type: file.type,
      attachment_size: file.size,
    })
    .select("id, chat_id, sender_id, message, attachment_url, attachment_name, attachment_type, attachment_size, is_read, created_at")
    .single();
  if (error) throw new ValidationError(error.message);

  const label = file.type.startsWith("image/") ? "📷 Photo" : file.type.startsWith("audio/") ? "🎤 Voice note" : "📎 Document";
  await ctx.svc
    .from("chats")
    .update({ last_message: `${label}: ${file.name}`, last_sender_id: ctx.user.id, last_message_at: new Date().toISOString() })
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
        message: `Sent an attachment: ${file.name}`.slice(0, 150),
        referenceType: "chat",
        referenceId: chatId,
      });
    }
  } else if (chat.other_staff_user_id != null) {
    // Staff-to-staff chat: notify the peer staff member (never the sender).
    const peerId =
      chat.staff_user_id === ctx.user.id ? chat.other_staff_user_id : chat.staff_user_id;
    if (peerId) {
      await notifyUsers(ctx.svc, {
        orgId: tenantId,
        userIds: [peerId],
        type: "chat_message",
        title: "New message from a colleague",
        message: `Sent an attachment: ${file.name}`.slice(0, 150),
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
        message: `Sent an attachment: ${file.name}`.slice(0, 150),
        referenceType: "chat",
        referenceId: chatId,
      });
    }
  }

  return ok(msg, 201);
});

export const runtime = "nodejs";
