import type { AppRole } from "@/lib/auth";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Roles allowed to manage the HR module (beyond staff self-service). */
export const HR_ADMIN_ROLES: AppRole[] = ["hospital_admin", "hr_officer", "super_admin"];

export function isHrAdmin(role: AppRole | undefined): boolean {
  return !!role && HR_ADMIN_ROLES.includes(role);
}

/**
 * Check the tenant's roles_permissions matrix (lazy-seeded) for a permission
 * key like "hr.payroll.view" / "prescribe". super_admin/hospital_admin bypass.
 * Supports exact keys, "prefix.*" wildcards and the seeded "hr.*" umbrella.
 */
export async function hrHasPermission(
  svc: SupabaseClient,
  tenantId: string,
  role: AppRole,
  key: string
): Promise<boolean> {
  if (role === "super_admin" || role === "hospital_admin") return true;
  try {
    const { data } = await svc
      .from("roles_permissions")
      .select("permissions")
      .eq("tenant_id", tenantId)
      .eq("role", role)
      .maybeSingle();
    const perms = (data?.permissions ?? {}) as Record<string, unknown>;
    if (perms["*"] === true) return true;
    if (perms[key] === true) return true;
    if (key.startsWith("hr.") && perms["hr.*"] === true) return true;
    const prefix = key.split(".").slice(0, -1).join(".");
    if (prefix && perms[`${prefix}.*`] === true) return true;
    return false;
  } catch {
    return false;
  }
}
