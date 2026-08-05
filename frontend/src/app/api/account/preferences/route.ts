import { withStaff, ok, ValidationError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export interface AccountPreferences {
  language: string;
  timezone: string;
  dateFormat: string;
  notifyAppointment: boolean;
  notifyPayment: boolean;
  notifyLab: boolean;
  notifyPharmacy: boolean;
  pushEnabled: boolean;
}

export const DEFAULT_PREFERENCES: AccountPreferences = {
  language: "en",
  timezone: "Africa/Lagos",
  dateFormat: "dd/mm/yyyy",
  notifyAppointment: true,
  notifyPayment: true,
  notifyLab: true,
  notifyPharmacy: true,
  pushEnabled: false,
};

const LANGUAGES = ["en", "fr", "sw", "ha", "yo", "ig"] as const;
const TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "America/New_York",
  "Europe/London",
  "UTC",
] as const;
const DATE_FORMATS = ["dd/mm/yyyy", "mm/dd/yyyy", "yyyy-mm-dd"] as const;

function sanitize(raw: Record<string, unknown>): Partial<AccountPreferences> {
  const out: Partial<AccountPreferences> = {};
  if (typeof raw.language === "string" && (LANGUAGES as readonly string[]).includes(raw.language)) {
    out.language = raw.language;
  }
  if (typeof raw.timezone === "string" && (TIMEZONES as readonly string[]).includes(raw.timezone)) {
    out.timezone = raw.timezone;
  }
  if (typeof raw.dateFormat === "string" && (DATE_FORMATS as readonly string[]).includes(raw.dateFormat)) {
    out.dateFormat = raw.dateFormat;
  }
  for (const key of ["notifyAppointment", "notifyPayment", "notifyLab", "notifyPharmacy", "pushEnabled"] as const) {
    if (typeof raw[key] === "boolean") out[key] = raw[key];
  }
  return out;
}

// GET /api/account/preferences — personal preferences for the signed-in user
export const GET = withStaff(async (req, ctx) => {
  const { data: user } = await ctx.svc
    .from("users")
    .select("id, preferences")
    .eq("id", ctx.user.id)
    .maybeSingle();
  const prefs = user?.preferences ?? {};
  return ok({ ...DEFAULT_PREFERENCES, ...prefs });
});

// PUT /api/account/preferences — merge validated preferences for the signed-in user
export const PUT = withStaff(async (req, ctx) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sanitized = sanitize(body);
  if (Object.keys(sanitized).length === 0) {
    throw new ValidationError("Nothing valid to update");
  }

  const { data: current } = await ctx.svc
    .from("users")
    .select("preferences")
    .eq("id", ctx.user.id)
    .maybeSingle();
  const merged = { ...DEFAULT_PREFERENCES, ...(current?.preferences ?? {}), ...sanitized };

  const { data: updated, error } = await ctx.svc
    .from("users")
    .update({ preferences: merged })
    .eq("id", ctx.user.id)
    .select("id, preferences")
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "users",
    entityId: ctx.user.id,
    description: `Updated personal preferences (${Object.keys(sanitized).join(", ")})`,
  });

  return ok({ ...DEFAULT_PREFERENCES, ...updated?.preferences });
});

export const runtime = "nodejs";
