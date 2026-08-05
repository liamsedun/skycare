import {
  withStaff,
  ok,
  ValidationError,
  ForbiddenError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isPlaceholderKey } from "@/lib/paystack";
import {
  DEFAULT_TENANT_SETTINGS,
  PREFIX_PATTERN,
  normalizePrefix,
  type TenantSettings,
} from "@/lib/tenant-settings";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PROFILED_FIELDS = [
  "name",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "country",
  "brand_color",
  "currency",
  "timezone",
] as const;

const CURRENCIES = ["NGN", "USD", "GHS", "KES", "ZAR", "GBP", "EUR"] as const;
const TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "America/New_York",
  "Europe/London",
  "UTC",
] as const;

const PAYSTACK_KEYS = ["publicKey", "secretKey", "webhookSecret"] as const;

function sanitizePaystackKeys(raw: Record<string, unknown>): Record<string, string | null> | null {
  const out: Record<string, string | null> = {};
  for (const key of PAYSTACK_KEYS) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (value === null) {
      out[key] = null; // explicit clear
      continue;
    }
    if (typeof value !== "string") {
      throw new ValidationError(`paystack.${key} must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed === "") {
      out[key] = null; // blank field = clear
      continue;
    }
    if (trimmed.length < 8 || trimmed.includes(" ")) {
      throw new ValidationError(`paystack.${key} looks invalid (min 8 chars, no spaces)`);
    }
    if (key !== "webhookSecret" && !isPlaceholderKey(trimmed) && !/^[a-z]{2}_(live|test)_/.test(trimmed)) {
      throw new ValidationError(`paystack.${key} should look like a Paystack key (e.g. sk_live_…)`);
    }
    out[key] = trimmed;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function sanitizeSettings(raw: Record<string, unknown>): Partial<TenantSettings> {
  const out: Partial<TenantSettings> = {};
  for (const key of ["patientPrefix", "dependantPrefix", "staffPrefix", "invoicePrefix"] as const) {
    const value = raw[key];
    if (typeof value === "string" && PREFIX_PATTERN.test(value.trim())) {
      out[key] = normalizePrefix(value);
    } else if (value != null) {
      throw new ValidationError(`Invalid ${key} — use letters, numbers, - or _ (max 12 chars)`);
    }
  }
  if (typeof raw.smsProvider === "string") out.smsProvider = raw.smsProvider;
  if (raw.smsProvider === "") out.smsProvider = null;
  if (typeof raw.labAutoFill === "boolean") out.labAutoFill = raw.labAutoFill;
  return out;
}

/** Strip secrets for the GET response; only a public key + configured flags leave the server. */
function redactPaystack(paystack: Record<string, unknown> | null | undefined) {
  if (!paystack || typeof paystack !== "object") return null;
  const secretKey = typeof paystack.secretKey === "string" ? paystack.secretKey : null;
  const webhookSecret = typeof paystack.webhookSecret === "string" ? paystack.webhookSecret : null;
  return {
    publicKey: typeof paystack.publicKey === "string" ? paystack.publicKey : null,
    secretKeyConfigured: Boolean(secretKey && !isPlaceholderKey(secretKey)),
    webhookSecretConfigured: Boolean(webhookSecret && !isPlaceholderKey(webhookSecret)),
    configured: Boolean(secretKey && !isPlaceholderKey(secretKey)),
  };
}

// GET /api/tenant-settings — admin org settings (profile + branding + prefixes)
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ForbiddenError("Only admins can view settings");
  }

  const { data: tenant } = await ctx.svc
    .from("tenants")
    .select("name, email, phone, address, city, state, country, brand_color, currency, timezone, settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) throw new ValidationError("Tenant not found");

  const settings = tenant.settings ?? {};
  const redacted = { ...settings };
  if (redacted.paystack) redacted.paystack = redactPaystack(redacted.paystack);
  return ok({ ...tenant, settings: redacted });
});

export interface UpdateTenantSettingsBody {
  profile?: Partial<Record<(typeof PROFILED_FIELDS)[number], string | null>>;
  settings?: Record<string, unknown>;
}

// PUT /api/tenant-settings — update profile fields + merge settings JSONB
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ForbiddenError("Only admins can update settings");
  }

  const body = (await req.json()) as UpdateTenantSettingsBody;

  const patch: Record<string, unknown> = {};
  if (body.profile) {
    for (const key of PROFILED_FIELDS) {
      if (key in body.profile) {
        const value = body.profile[key];
        if (key === "name" && value != null && value.trim().length < 2) {
          throw new ValidationError("Hospital name must be at least 2 characters");
        }
        if (key === "currency" && value != null && !CURRENCIES.includes(value as never)) {
          throw new ValidationError(`Unsupported currency — choose from ${CURRENCIES.join(", ")}`);
        }
        if (key === "timezone" && value != null && !TIMEZONES.includes(value as never)) {
          throw new ValidationError(`Unsupported timezone — choose from ${TIMEZONES.join(", ")}`);
        }
        if (key === "brand_color" && value != null && !/^#[0-9a-fA-F]{6}$/.test(value)) {
          throw new ValidationError("Brand color must be a hex value like #0ea5e9");
        }
        patch[key] = value;
      }
    }
  }

  let settingsPatch: Record<string, unknown> | null = null;
  if (body.settings) {
    const sanitized = sanitizeSettings(body.settings);
    if (Object.keys(sanitized).length > 0) settingsPatch = sanitized;
    const paystack =
      body.settings.paystack && typeof body.settings.paystack === "object"
        ? sanitizePaystackKeys(body.settings.paystack as Record<string, unknown>)
        : null;
    if (paystack) settingsPatch = { ...(settingsPatch ?? {}), paystack };
  }

  if (Object.keys(patch).length === 0 && !settingsPatch) {
    throw new ValidationError("Nothing to update");
  }

  // Merge settings into the existing JSONB, preserving unknown keys.
  if (settingsPatch) {
    const { data: current } = await ctx.svc
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .maybeSingle();
    const existing = (current?.settings ?? {}) as Record<string, unknown>;
    const merged = { ...existing, ...settingsPatch };
    // Paystack updates are partial — merge into the existing paystack object.
    if (settingsPatch.paystack) {
      const existingPaystack =
        existing.paystack && typeof existing.paystack === "object" ? (existing.paystack as Record<string, unknown>) : {};
      merged.paystack = { ...existingPaystack, ...(settingsPatch.paystack as Record<string, unknown>) };
    }
    patch.settings = merged;
  }

  const { data: updated, error } = await ctx.svc
    .from("tenants")
    .update(patch)
    .eq("id", tenantId)
    .select("name, email, phone, address, city, state, country, brand_color, currency, timezone, settings")
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "tenants",
    entityId: tenantId,
    description: `Updated hospital settings (${Object.keys(patch).join(", ")})`,
  });

  return ok(updated);
});

export const runtime = "nodejs";