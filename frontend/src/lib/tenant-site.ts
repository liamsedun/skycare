import { createServiceClient } from "@/lib/supabase/server";
import { HeartPulse, Stethoscope, FlaskConical, Pill, Baby,
  Ambulance, Scissors, Syringe } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Shared data layer for tenant website pages ([slug]/*).
 * All reads use the service client (anon never touches RLS tables);
 * every row is tenant-scoped.
 */

export const DEFAULT_SERVICES = [
  "General Consultation",
  "Cardiology",
  "Laboratory & Diagnostics",
  "Pharmacy",
  "Maternity & Pediatrics",
  "Emergency Care",
  "Surgery",
  "Vaccination",
];

export const FALLBACK_ICONS: Record<string, LucideIcon> = {
  stethoscope: Stethoscope,
  flask: FlaskConical,
  pill: Pill,
  baby: Baby,
  ambulance: Ambulance,
  scissors: Scissors,
  syringe: Syringe,
  heart: HeartPulse,
};

export function serviceIcon(name?: string | null): LucideIcon {
  const key = (name ?? "").trim().toLowerCase();
  return FALLBACK_ICONS[key] ?? HeartPulse;
}

export type WebsiteService = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  display_order: number;
  active: boolean;
};

export type WebsiteDepartment = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  display_order: number;
  active: boolean;
};

export async function loadWebsiteServices(
  tenantId: string
): Promise<WebsiteService[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("website_services")
    .select("id, name, description, icon, image_url, display_order, active")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as WebsiteService[];
}

export async function loadWebsiteDepartments(
  tenantId: string
): Promise<WebsiteDepartment[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("website_departments")
    .select("id, name, description, icon, image_url, display_order, active")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as WebsiteDepartment[];
}

export type LandingDoctor = {
  id: string;
  name: string;
  specialty: string | null;
  image_url: string | null;
  available: boolean;
  availability: string | null;
};

export async function loadLandingDoctors(tenantId: string): Promise<LandingDoctor[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("landing_doctors")
    .select("id, name, specialty, image_url, available, availability")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as LandingDoctor[];
}

/** CMS page content (website_pages) keyed by slug, or null when unpublished/absent. */
export async function loadWebsitePage(
  tenantId: string,
  slug: string
): Promise<{ title: string; content: Record<string, unknown> } | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("website_pages")
    .select("title, content")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!data) return null;
  return { title: data.title, content: (data.content ?? {}) as Record<string, unknown> };
}
