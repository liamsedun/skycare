import type { SupabaseClient } from "@supabase/supabase-js";
import { pushNotifyUsers } from "@/lib/push-send";

// ============================================================================
// NOTIFICATIONS — inserts in-app notification rows (tenant-scoped).
// SkyCare notifications columns: tenant_id, user_id, channel, event, title,
// message, reference_type, reference_id, is_read, status, sent_at.
// ============================================================================

export type NotificationType =
  | "appointment_reminder"
  | "payment_due"
  | "payment_declared"
  | "payment_confirmed"
  | "payment_cancelled"
  | "lab_result"
  | "prescription_refill"
  | "chat_message"
  | "duty_schedule"
  | "general";

export interface NotifyInput {
  orgId: string; // tenantId
  userIds: string[];
  type: NotificationType;
  title: string;
  message?: string;
  referenceType?: string;
  referenceId?: string;
}

export async function notifyUsers(
  svc: SupabaseClient,
  input: NotifyInput
): Promise<void> {
  if (input.userIds.length === 0) return;
  const rows = input.userIds.map((userId) => ({
    tenant_id: input.orgId,
    user_id: userId,
    channel: "in_app",
    event: input.type,
    title: input.title,
    message: input.message ?? input.title,
    reference_type: input.referenceType ?? null,
    reference_id: input.referenceId ?? null,
    is_read: false,
    status: "sent",
    sent_at: new Date().toISOString(),
  }));
  await svc.from("notifications").insert(rows);

  await pushNotifyUsers(svc, {
    userIds: input.userIds,
    type: input.type,
    title: input.title,
    body: input.message ?? undefined,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
  });
}
