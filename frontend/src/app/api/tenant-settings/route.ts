import {
  withStaff,
  ok,
  ValidationError,
  ForbiddenError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
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
  return ok({ ...tenant, settings });
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
    const merged = { ...(current?.settings ?? {}), ...settingsPatch };
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