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
  | "invoice_issued"
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

// Resolve the portal users for a patient row: the patient's own account plus
// the primary account holder when the patient is a dependant, so bills and
// receipts always reach the family inbox.
export async function resolvePatientUserIds(
  svc: SupabaseClient,
  tenantId: string,
  patientId: string | null | undefined
): Promise<string[]> {
  if (!patientId) return [];
  const { data } = await svc
    .from("patients")
    .select("user_id, primary_account_id")
    .eq("id", patientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return [];
  const ids = new Set<string>();
  if (data.user_id) ids.add(data.user_id);
  if (data.primary_account_id && data.primary_account_id !== patientId) {
    const { data: root } = await svc
      .from("patients")
      .select("user_id")
      .eq("id", data.primary_account_id)
      .maybeSingle();
    if (root?.user_id) ids.add(root.user_id);
  }
  return Array.from(ids);
}

// Notify a patient's family users that a bill/invoice has been raised on
// their account (medical, lab, pharmacy or ward charges). Reference points at
// the central invoices row the patient portal reads.
export async function notifyInvoiceIssued(
  svc: SupabaseClient,
  tenantId: string,
  patientId: string | null | undefined,
  invoiceId: string,
  invoiceNumber: string,
  totalAmount: number
): Promise<void> {
  const userIds = await resolvePatientUserIds(svc, tenantId, patientId);
  if (userIds.length === 0) return;
  await notifyUsers(svc, {
    orgId: tenantId,
    userIds,
    type: "invoice_issued",
    title: "New bill on your account",
    message: `Invoice ${invoiceNumber} — ₦${Number(totalAmount).toLocaleString()} has been raised on your account.`,
    referenceType: "invoices",
    referenceId: invoiceId,
  });
}
