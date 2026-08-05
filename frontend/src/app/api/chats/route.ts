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

const STAFF_ROLES = ["hospital_admin", "super_admin", "doctor", "nurse", "pharmacist", "lab_tech", "cashier", "receptionist"];

// GET /api/chats — conversations for the caller + directory of people to start new chats with
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const svc = ctx.svc;
  const role = ctx.role;

  if (role === "patient_api") {
    throw new ValidationError("Chats are a staff feature");
  }

  const { data: chats, error: chatError } = await svc
    .from("chats")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("staff_user_id", ctx.user.id)
    .order("updated_at", { ascending: false });
  if (chatError) throw new ValidationError(chatError.message);

  const { data: presence } = await svc
    .from("chat_presence")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .gte("last_seen_at", new Date(Date.now() - 60_000).toISOString());
  const online = new Set((presence ?? []).map((p: any) => p.user_id));

  const chatIds = (chats ?? []).map((c: any) => c.id);
  const unreadMap = new Map<string, number>();
  if (chatIds.length > 0) {
    const { data: unreadRows } = await svc
      .from("chat_messages")
      .select("chat_id")
      .eq("is_read", false)
      .neq("sender_id", ctx.user.id)
      .in("chat_id", chatIds);
    for (const row of unreadRows ?? []) {
      const cid = (row as any).chat_id;
      unreadMap.set(cid, (unreadMap.get(cid) ?? 0) + 1);
    }
  }

  const patientIds = [...new Set((chats ?? []).map((c: any) => c.patient_id).filter(Boolean))];
  const patientProfileMap = new Map<string, any>();
  if (patientIds.length > 0) {
    const { data: pats } = await svc
      .from("patients")
      .select("id, user_id, primary_account_id, first_name, last_name, patient_number, users!patients_user_id_fkey(id, full_name, avatar_url)")
      .in("id", patientIds);
    for (const p of pats ?? []) patientProfileMap.set(p.id, p);
  }

  const list = (chats ?? []).map((c: any) => {
    const p = patientProfileMap.get(c.patient_id);
    const user = p?.users;
    return {
      id: c.id,
      patient_id: c.patient_id,
      last_message: c.last_message,
      last_sender_id: c.last_sender_id,
      last_message_at: c.last_message_at,
      updated_at: c.updated_at,
      unread_count: unreadMap.get(c.id) ?? 0,
      other_user: user
        ? {
            id: p.user_id,
            full_name: user.full_name ?? `${p.first_name} ${p.last_name}`.trim(),
            patient_number: p.patient_number,
            avatar_url: user.avatar_url ?? null,
            is_dependant: Boolean(p.primary_account_id),
          }
        : null,
    };
  });

  // Directory for starting new conversations: all patients with portal logins.
  const { data: patients } = await svc
    .from("patients")
    .select("id, user_id, first_name, last_name, patient_number, primary_account_id, users!patients_user_id_fkey(id, full_name, avatar_url)")
    .eq("tenant_id", tenantId)
    .not("user_id", "is", null);
  const directory = (patients ?? []).map((p: any) => ({
    patient_id: p.id,
    user_id: p.user_id,
    full_name: p.users?.full_name ?? `${p.first_name} ${p.last_name}`.trim(),
    patient_number: p.patient_number,
    avatar_url: p.users?.avatar_url ?? null,
    is_dependant: Boolean(p.primary_account_id),
  }));

  return ok({
    chats: list,
    directory,
    online: [...online],
    caller_role: role,
  });
});

interface CreateChatBody {
  patientId: string;
}

// POST /api/chats — create-or-fetch a conversation with a patient
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const svc = ctx.svc;
  if (ctx.role === "patient_api") throw new ValidationError("Chats are a staff feature");
  const body = (await req.json()) as CreateChatBody;
  if (!body.patientId) throw new ValidationError("patientId is required");

  const { data: patient, error: pErr } = await svc
    .from("patients")
    .select("id, user_id, primary_account_id")
    .eq("id", body.patientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (pErr || !patient) throw new NotFoundError("Patient not found");
  if (!patient.user_id) throw new ValidationError("Patient has no portal account — register one first");

  const { data: existing } = await svc
    .from("chats")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("patient_id", body.patientId)
    .eq("staff_user_id", ctx.user.id)
    .maybeSingle();

  let chat = existing;
  if (!chat) {
    const { data: inserted, error: insertError } = await svc
      .from("chats")
      .insert({ tenant_id: tenantId, patient_id: body.patientId, staff_user_id: ctx.user.id })
      .select()
      .single();
    if (insertError) throw new ValidationError(insertError.message);
    chat = inserted;
    await logAudit(req, ctx, {
      action: "create",
      entityType: "chats",
      entityId: chat.id,
      description: "Opened a chat with a patient",
    });
  }

  const { data: user } = await svc
    .from("users")
    .select("id, full_name, avatar_url")
    .eq("id", patient.user_id)
    .maybeSingle();

  const { data: p2 } = await svc
    .from("patients")
    .select("first_name, last_name, patient_number")
    .eq("id", body.patientId)
    .maybeSingle();

  return ok({
    chat,
    other_user: user
      ? {
          id: patient.user_id,
          full_name: user.full_name ?? (p2 ? `${p2.first_name} ${p2.last_name}`.trim() : "Patient"),
          patient_number: p2?.patient_number ?? null,
          avatar_url: user.avatar_url ?? null,
          is_dependant: Boolean(patient.primary_account_id),
        }
      : null,
  });
});

export const runtime = "nodejs";