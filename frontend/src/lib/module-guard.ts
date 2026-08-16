import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getClaims } from "@/lib/auth";
import { accessLevelOf, type AccessLevel, type ModuleAccess } from "@/lib/nav";

/**
 * Server-page guard that mirrors how the sidebar builds the nav:
 *
 * - NULL module_access (role default): the page's fallback role list applies,
 *   exactly as before — no moduleAccess record means no behaviour change.
 * - NON-NULL module_access record: it is the authority. Any level other than
 *   "none" on the page's module key lets the user in (so a view-only grant
 *   lands on the page instead of bouncing to the dashboard); "none" redirects
 *   to /app. The caller then receives the AccessLevel so the client view can
 *   render read-only.
 */
export async function requireModulePage(
  supabase: SupabaseClient,
  user: User,
  key: string,
  fallbackRoles: readonly string[]
): Promise<AccessLevel> {
  const { data } = await supabase
    .from("users")
    .select("module_access")
    .eq("id", user.id)
    .maybeSingle();

  const access = data?.module_access;
  if (access && typeof access === "object" && access !== null) {
    const level = accessLevelOf(access as ModuleAccess, key);
    if (level === "none") redirect("/app");
    return level;
  }

  const role = getClaims(user).role;
  if (!role || !fallbackRoles.includes(role)) redirect("/app");
  return "full";
}