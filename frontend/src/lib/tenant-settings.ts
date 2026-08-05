import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// TENANT SETTINGS + ID NUMBER GENERATION (org-settings adaptation)
// Settings live in tenants.settings JSONB. All counts are tenant-scoped.
// ============================================================================

export interface TenantSettings {
  patientPrefix: string;
  dependantPrefix: string;
  staffPrefix: string;
  invoicePrefix: string;
  smsProvider: string | null;
  labAutoFill: boolean;
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  patientPrefix: "PT-",
  dependantPrefix: "DEP-",
  staffPrefix: "STF-",
  invoicePrefix: "INV-",
  smsProvider: null,
  labAutoFill: false,
};

export const PREFIX_PATTERN = /^[A-Za-z0-9_\- ]{1,12}$/;

export function normalizePrefix(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith("-") ? trimmed : `${trimmed}-`;
}

export async function getTenantSettings(
  svc: SupabaseClient,
  tenantId: string
): Promise<TenantSettings> {
  const { data } = await svc
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return {
    patientPrefix:
      typeof settings.patientPrefix === "string" && PREFIX_PATTERN.test(settings.patientPrefix)
        ? normalizePrefix(settings.patientPrefix)
        : DEFAULT_TENANT_SETTINGS.patientPrefix,
    dependantPrefix:
      typeof settings.dependantPrefix === "string" && PREFIX_PATTERN.test(settings.dependantPrefix)
        ? normalizePrefix(settings.dependantPrefix)
        : DEFAULT_TENANT_SETTINGS.dependantPrefix,
    staffPrefix:
      typeof settings.staffPrefix === "string" && PREFIX_PATTERN.test(settings.staffPrefix)
        ? normalizePrefix(settings.staffPrefix)
        : DEFAULT_TENANT_SETTINGS.staffPrefix,
    invoicePrefix:
      typeof settings.invoicePrefix === "string" && PREFIX_PATTERN.test(settings.invoicePrefix)
        ? normalizePrefix(settings.invoicePrefix)
        : DEFAULT_TENANT_SETTINGS.invoicePrefix,
    smsProvider: typeof settings.smsProvider === "string" ? settings.smsProvider : null,
    labAutoFill: settings.labAutoFill === true,
  };
}

export async function generatePatientNumber(
  svc: SupabaseClient,
  tenantId: string,
  prefix: string
): Promise<string> {
  const { count } = await svc
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  return `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export async function generateStaffNumber(
  svc: SupabaseClient,
  tenantId: string,
  prefix: string
): Promise<string> {
  const { count } = await svc
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  return `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export async function generateInvoiceNumber(
  svc: SupabaseClient,
  tenantId: string,
  prefix: string
): Promise<string> {
  const { count } = await svc
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  return `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;
}
