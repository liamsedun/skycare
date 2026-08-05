import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "@/lib/notify";

// ============================================================================
// PUSH NOTIFICATIONS — sends web-push messages to registered devices after
// notifyUsers() writes the in-app rows. Best-effort: never throws, never
// blocks the caller. Requires VAPID keys in env (see .env.example).
// ============================================================================

export interface PushContext {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  referenceType?: string;
  referenceId?: string;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  subscription_json: {
    endpoint: string;
    keys?: { p256dh?: string; auth?: string } | null;
  } | null;
}

interface PreferencesRow {
  id: string;
  preferences: Record<string, unknown> | null;
}

/** Notification event -> account preference toggle (missing toggle = unconstrained). */
const EVENT_TOGGLE: Partial<Record<NotificationType, string>> = {
  appointment_reminder: "notifyAppointment",
  payment_due: "notifyPayment",
  payment_declared: "notifyPayment",
  payment_confirmed: "notifyPayment",
  payment_cancelled: "notifyPayment",
  lab_result: "notifyLab",
  prescription_refill: "notifyPharmacy",
};

/** referenceType -> /app/<route> so a tapped notification opens the right page. */
function targetUrl(referenceType: string | undefined): string {
  switch (referenceType) {
    case "appointments":
      return "/app/appointments";
    case "lab_orders":
      return "/app/lab";
    case "prescriptions":
      return "/app/pharmacy";
    case "payments":
      return "/app/billing";
    case "chat":
      return "/app/chats";
    case "internal_message":
      return "/app/mail";
    case "staff_leave":
      return "/app/leave";
    default:
      return "/app/notifications";
  }
}

function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

/**
 * Fire web push to every registered device for the given users, honouring
 * each user's pushEnabled flag + their per-category toggles. Stale
 * subscriptions the push service rejects (404/410) are pruned.
 */
export async function pushNotifyUsers(
  svc: SupabaseClient,
  input: PushContext
): Promise<void> {
  if (input.userIds.length === 0 || !isConfigured()) return;

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );

    const { data: prefsRows } = await svc
      .from("users")
      .select("id, preferences")
      .in("id", input.userIds);
    if (!prefsRows || prefsRows.length === 0) return;

    const prefByUser = new Map<string, Record<string, unknown>>();
    for (const row of prefsRows as PreferencesRow[]) {
      prefByUser.set(row.id, row.preferences ?? {});
    }

    const toggle = EVENT_TOGGLE[input.type] ?? null;
    const optIn = input.userIds.filter((uid) => {
      const p = prefByUser.get(uid) ?? {};
      if (p.pushEnabled !== true) return false;
      if (toggle && p[toggle] === false) return false;
      return true;
    });
    if (optIn.length === 0) return;

    const { data: subs } = await svc
      .from("push_subscriptions")
      .select("id, user_id, endpoint, subscription_json")
      .in("user_id", optIn);
    if (!subs || subs.length === 0) return;

    const ttl = 60 * 60 * 24; // 24h
    const body = input.body ?? input.title;
    const url = targetUrl(input.referenceType);

    const results = await Promise.allSettled(
      (subs as PushSubscriptionRow[]).map((sub) => {
        const s = sub.subscription_json;
        if (!s || !s.endpoint) return Promise.resolve("skip");
        return webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: {
              p256dh: s.keys?.p256dh ?? "",
              auth: s.keys?.auth ?? "",
            },
          },
          JSON.stringify({
            title: input.title,
            body,
            tag: `${input.type}:${sub.user_id}`,
            url,
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
          }),
          { TTL: ttl }
        );
      })
    );

    const dead: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const err = (r.reason as { statusCode?: number }) ?? {};
        if (err.statusCode === 404 || err.statusCode === 410) {
          const sub = (subs as PushSubscriptionRow[])[i];
          if (sub) dead.push(sub.id);
        }
      }
    });
    if (dead.length > 0) {
      await svc.from("push_subscriptions").delete().in("id", dead);
    }
  } catch {
    // Best-effort — push must never break the surrounding request.
  }
}