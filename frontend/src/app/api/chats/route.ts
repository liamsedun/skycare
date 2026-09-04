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

const STAFF_ROLES = ["hospital_admin", "doctor", "nurse", "pharmacist", "lab_tech", "cashier", "receptionist"];

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

// GET /api/chats — conversations for the caller + directory of people to start new chats with
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const svc = ctx.svc;
  const role = ctx.role;
  const isPatient = role === "patient_api";

  const { data: chatsRaw, error: chatError } = await svc
    .from("chats")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });
  if (chatError) throw new ValidationError(chatError.message);

  let chats = chatsRaw ?? [];
  if (isPatient) {
    const ids = await familyIds(ctx);
    chats = chats.filter((c: any) => c.staff_user_id != null && ids.includes(c.patient_id));
  } else {
    chats = chats.filter(
      (c: any) => c.staff_user_id === ctx.user.id || c.other_staff_user_id === ctx.user.id
    );
  }

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

  const staffMap = new Map<string, any>();
  const patientMap = new Map<string, any>();
  if (isPatient) {
    // Patient side: other party is the staff member on the chat row.
    const staffIds = [...new Set((chats ?? []).map((c: any) => c.staff_user_id).filter(Boolean))];
    if (staffIds.length > 0) {
      const { data: staff } = await svc
        .from("users")
        .select("id, full_name, avatar_url, role, phone")
        .in("id", staffIds);
      for (const s of staff ?? []) staffMap.set(s.id, s);
    }
  } else {
    const patientIds = [...new Set((chats ?? []).map((c: any) => c.patient_id).filter(Boolean))];
    if (patientIds.length > 0) {
      const { data: pats } = await svc
        .from("patients")
        .select("id, user_id, primary_account_id, first_name, last_name, patient_number, phone, users!patients_user_id_fkey(id, full_name, avatar_url)")
        .in("id", patientIds);
      for (const p of pats ?? []) patientMap.set(p.id, p);
    }
    // Staff-to-staff chats: the "other" party is the colleague on the row.
    const peerIds = [...new Set((chats ?? []).map((c: any) =>
      c.other_staff_user_id != null && c.staff_user_id === ctx.user.id ? c.other_staff_user_id
      : c.other_staff_user_id != null && c.other_staff_user_id === ctx.user.id ? c.staff_user_id
      : null
    ).filter(Boolean))];
    if (peerIds.length > 0) {
      const { data: peers } = await svc
        .from("users")
        .select("id, full_name, avatar_url, role, phone")
        .in("id", peerIds);
      for (const s of peers ?? []) staffMap.set(s.id, s);
    }
  }

  const list = (chats ?? []).map((c: any) => {
    // kind: "patient" = a chat with a patient/family; "staff" = staff-to-staff chat.
    const kind = c.other_staff_user_id != null ? "staff" : "patient";
    const peerId = c.other_staff_user_id != null
      ? (c.staff_user_id === ctx.user.id ? c.other_staff_user_id : c.staff_user_id)
      : null;
    const s = kind === "staff" ? staffMap.get(peerId) : isPatient ? staffMap.get(c.staff_user_id) : null;
    const p = isPatient ? null : patientMap.get(c.patient_id);
    const user = p?.users;
    const patName = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "";
    return {
      id: c.id,
      patient_id: c.patient_id,
      other_staff_user_id: c.other_staff_user_id ?? null,
      kind,
      last_message: c.last_message,
      last_sender_id: c.last_sender_id,
      last_message_at: c.last_message_at,
      updated_at: c.updated_at,
      unread_count: unreadMap.get(c.id) ?? 0,
      other_user: kind === "staff"
        ? s
          ? { id: s.id, full_name: s.full_name ?? "Staff", role: s.role, avatar_url: s.avatar_url ?? null, phone: s.phone ?? null }
          : null
        : isPatient
          ? s
            ? { id: s.id, full_name: s.full_name ?? "Staff", role: s.role, avatar_url: s.avatar_url ?? null, phone: s.phone ?? null }
            : null
          : user
            ? {
                id: p.user_id,
                full_name: user.full_name ?? patName,
                patient_number: p.patient_number,
                avatar_url: user.avatar_url ?? null,
                is_dependant: Boolean(p.primary_account_id),
                has_account: Boolean(p.user_id),
                phone: p.phone ?? null,
              }
            : p
              ? {
                  id: p.id,
                  full_name: patName || "Patient",
                  patient_number: p.patient_number,
                  avatar_url: null,
                  is_dependant: Boolean(p.primary_account_id),
                  has_account: false,
                  phone: p.phone ?? null,
                }
              : null,
    };
  });

  // Directory for starting new conversations:
  // staff -> patients with portal logins; patient -> staff of the tenant.
  let directory: any[];
  if (isPatient) {
    const { data: staff } = await svc
      .from("users")
      .select("id, full_name, role, phone, avatar_url")
      .eq("tenant_id", tenantId)
      .in("role", STAFF_ROLES)
      .eq("is_active", true)
      .neq("id", ctx.user.id);
    directory = (staff ?? []).map((s: any) => ({
      id: s.id,
      full_name: s.full_name ?? "Staff",
      role: s.role,
      phone: s.phone ?? null,
      avatar_url: s.avatar_url ?? null,
    }));
  } else {
    const { data: staff } = await svc
      .from("users")
      .select("id, full_name, role, phone, avatar_url")
      .eq("tenant_id", tenantId)
      .in("role", STAFF_ROLES)
      .eq("is_active", true)
      .neq("id", ctx.user.id);
    const staffDirectory = (staff ?? []).map((s: any) => ({
      id: s.id,
      kind: "staff",
      full_name: s.full_name ?? "Staff",
      role: s.role,
      phone: s.phone ?? null,
      avatar_url: s.avatar_url ?? null,
    }));
    const { data: patients } = await svc
      .from("patients")
      .select("id, user_id, first_name, last_name, patient_number, phone, primary_account_id, users!patients_user_id_fkey(id, full_name, avatar_url)")
      .eq("tenant_id", tenantId)
      .eq("status", "active");
    const patientDirectory = (patients ?? []).map((p: any) => ({
      kind: "patient",
      patient_id: p.id,
      user_id: p.user_id,
      full_name: p.users?.full_name ?? `${p.first_name} ${p.last_name}`.trim(),
      patient_number: p.patient_number,
      phone: p.phone ?? null,
      avatar_url: p.users?.avatar_url ?? null,
      is_dependant: Boolean(p.primary_account_id),
      has_account: Boolean(p.user_id),
    }));
    directory = [...staffDirectory, ...patientDirectory];
  }

  return ok({
    chats: list,
    directory,
    online: [...online],
    caller_role: role,
  });
});

interface CreateChatBody {
  patientId?: string;
  staffUserId?: string;
}

// POST /api/chats — create-or-fetch a conversation.
// - patient caller -> staff (body.staffUserId = the staff member to message)
// - staff caller with patientId -> chat with that patient
// - staff caller with staffUserId -> staff-to-staff chat with that colleague
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const svc = ctx.svc;
  const isPatient = ctx.role === "patient_api";
  const body = (await req.json()) as CreateChatBody;

  let chat: any;
  let rectified: any;

  if (isPatient) {
    if (!body.staffUserId) throw new ValidationError("staffUserId is required");
    const staffUserId = body.staffUserId;
    const { data: staff } = await svc
      .from("users")
      .select("id, full_name, phone, avatar_url, role")
      .eq("id", staffUserId)
      .eq("tenant_id", tenantId)
      .in("role", STAFF_ROLES)
      .maybeSingle();
    if (!staff) throw new NotFoundError("Staff member not found");
    const ids = await familyIds(ctx);
    const { data: mine } = await svc
      .from("patients")
      .select("id")
      .eq("user_id", ctx.user.id)
      .in("id", ids)
      .maybeSingle();
    const patientId = (mine as any)?.id;
    if (!patientId) throw new NotFoundError("No patient record linked to your account");

    const { data: existing } = await svc
      .from("chats")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("patient_id", patientId)
      .eq("staff_user_id", staffUserId)
      .maybeSingle();
    chat = existing;
    if (!chat) {
      const { data: inserted, error: insertError } = await svc
        .from("chats")
        .insert({ tenant_id: tenantId, patient_id: patientId, staff_user_id: staffUserId })
        .select()
        .single();
      if (insertError) throw new ValidationError(insertError.message);
      chat = inserted;
      await logAudit(req, ctx, {
        action: "create",
        entityType: "chats",
        entityId: chat.id,
        description: "Started a chat with hospital staff",
      });
    }
    rectified = {
      id: staffUserId,
      kind: "staff",
      full_name: staff.full_name ?? "Staff",
      role: staff.role,
      avatar_url: staff.avatar_url ?? null,
      phone: staff.phone ?? null,
    };
  } else if (body.staffUserId != null) {
    // Staff-to-staff chat.
    const targetId = body.staffUserId;
    if (targetId === ctx.user.id) throw new ValidationError("You cannot start a chat with yourself");
    const { data: target } = await svc
      .from("users")
      .select("id, full_name, phone, avatar_url, role")
      .eq("id", targetId)
      .eq("tenant_id", tenantId)
      .in("role", STAFF_ROLES)
      .eq("is_active", true)
      .maybeSingle();
    if (!target) throw new NotFoundError("Staff member not found");

    const pair = [ctx.user.id, targetId].sort();
    const { data: existing } = await svc
      .from("chats")
      .select("*")
      .eq("tenant_id", tenantId)
      .is("patient_id", null)
      .or(
        `and(staff_user_id.eq.${pair[0]},other_staff_user_id.eq.${pair[1]}),and(staff_user_id.eq.${pair[1]},other_staff_user_id.eq.${pair[0]})`
      )
      .maybeSingle();
    chat = existing;
    if (!chat) {
      const { data: inserted, error: insertError } = await svc
        .from("chats")
        .insert({ tenant_id: tenantId, staff_user_id: ctx.user.id, other_staff_user_id: targetId })
        .select()
        .single();
      if (insertError) {
        // Unique pair already exists (inserted from the other side concurrently).
        const { data: again } = await svc
          .from("chats")
          .select("*")
          .eq("tenant_id", tenantId)
          .is("patient_id", null)
          .or(
            `and(staff_user_id.eq.${pair[0]},other_staff_user_id.eq.${pair[1]}),and(staff_user_id.eq.${pair[1]},other_staff_user_id.eq.${pair[0]})`
          )
          .maybeSingle();
        chat = again ?? null;
      } else {
        chat = inserted;
      }
      if (chat) {
        await logAudit(req, ctx, {
          action: "create",
          entityType: "chats",
          entityId: chat.id,
          description: "Started a chat with a colleague",
        });
      }
    }
    rectified = {
      id: targetId,
      kind: "staff",
      full_name: target.full_name ?? "Staff",
      role: target.role,
      avatar_url: target.avatar_url ?? null,
      phone: target.phone ?? null,
    };
  } else {
    if (!body.patientId) throw new ValidationError("patientId is required");
    const patientId = body.patientId;
    const { data: patient, error: pErr } = await svc
      .from("patients")
      .select("id, user_id, primary_account_id")
      .eq("id", body.patientId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (pErr || !patient) throw new NotFoundError("Patient not found");
    // Dependants without their own portal account are reachable through the
    // family account holder, so only block patients with no route at all.
    if (!patient.user_id && !patient.primary_account_id) {
      throw new ValidationError("Patient has no portal account — register one first");
    }

    const { data: existing } = await svc
      .from("chats")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("patient_id", patientId)
      .eq("staff_user_id", ctx.user.id)
      .maybeSingle();
    chat = existing;
    if (!chat) {
      const { data: inserted, error: insertError } = await svc
        .from("chats")
        .insert({ tenant_id: tenantId, patient_id: patientId, staff_user_id: ctx.user.id })
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

    const otherUserId = ((await svc.from("patients").select("user_id").eq("id", patientId).maybeSingle()).data as any)?.user_id;
    const { data: user } = await svc
      .from("users")
      .select("id, full_name, phone, avatar_url")
      .eq("id", otherUserId ?? "")
      .maybeSingle();
    const { data: p2 } = await svc
      .from("patients")
      .select("first_name, last_name, patient_number, phone, primary_account_id")
      .eq("id", patientId)
      .maybeSingle();
    rectified = user
      ? {
          id: otherUserId,
          kind: "patient",
          full_name: user.full_name ?? (p2 ? `${p2.first_name} ${p2.last_name}`.trim() : "Patient"),
          patient_number: p2?.patient_number ?? null,
          avatar_url: user.avatar_url ?? null,
          is_dependant: Boolean((chat as any).patient_id === patientId && p2?.primary_account_id),
          has_account: true,
          phone: p2?.phone ?? null,
        }
      : p2
        ? {
            id: patientId,
            kind: "patient",
            full_name: `${p2.first_name} ${p2.last_name}`.trim() || "Patient",
            patient_number: p2.patient_number ?? null,
            avatar_url: null,
            is_dependant: Boolean(p2.primary_account_id),
            has_account: false,
            phone: p2.phone ?? null,
          }
        : null;
  }

  return ok({ chat, other_user: rectified });
});

export const runtime = "nodejs";