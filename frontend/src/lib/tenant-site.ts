import { createServiceClient } from "@/lib/supabase/server";
import { HeartPulse, Stethoscope, FlaskConical, Pill, Baby,
  Ambulance, Scissors, Syringe } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  getCachedWebsiteServices,
  getCachedWebsiteDepartments,
  getCachedLandingDoctors,
  getCachedWebsitePage,
} from "@/lib/cache";

/**
 * Shared data layer for tenant website pages ([slug]/*).
 * All reads use the service client (anon never touches RLS tables);
 * every row is tenant-scoped.
 */

/** Public tenant profile as exposed by `tenant_public_profile` (migration 0088/0091).
 * The template renders a fixed Life Blossom-branded look; only content swaps. */
export type TenantSiteProfile = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logo_url: string | null;
  brand_color: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  website_url: string | null;
  is_active: boolean;
  subscription_status: string | null;
  website_enabled: boolean;
  tagline: string | null;
  about: string | null;
  hero_image: string | null;
  about_story_image: string | null;
  facility_image: string | null;
  emergency_phone: string | null;
  opening_hours: Record<string, string> | null;
  social: Record<string, string | null> | null;
  seo_title: string | null;
  seo_description: string | null;
  favicon_url: string | null;
};

export function tenantAddress(tenant: TenantSiteProfile): string | null {
  return [tenant.address, tenant.city, tenant.state].filter(Boolean).join(", ") || null;
}

/** `${slug}/book` / `${slug}`-relative hrefs used across template components. */
export function tenantHome(tenant: TenantSiteProfile): string {
  return `/${tenant.slug}`;
}

export function tenantWhatsApp(tenant: TenantSiteProfile): string | null {
  const wa = tenant.social?.whatsapp;
  if (wa && /^https?:\/\//.test(wa)) return wa;
  const raw = wa ?? tenant.emergency_phone ?? tenant.phone;
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

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
  return (await getCachedWebsiteServices(tenantId)) as WebsiteService[];
}

export async function loadWebsiteDepartments(
  tenantId: string
): Promise<WebsiteDepartment[]> {
  return (await getCachedWebsiteDepartments(tenantId)) as WebsiteDepartment[];
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
  return (await getCachedLandingDoctors(tenantId)) as LandingDoctor[];
}

/** CMS page content (website_pages) keyed by slug, or null when unpublished/absent. */
export async function loadWebsitePage(
  tenantId: string,
  slug: string
): Promise<{ title: string; content: Record<string, unknown> } | null> {
  return getCachedWebsitePage(tenantId, slug);
}
