import { notFound } from "next/navigation";
import { HeartPulse } from "lucide-react";
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { getHost, loadTenant } from "@/lib/tenant";
import type { TenantSiteProfile } from "@/lib/tenant-site";
import TenantNavbar from "@/components/tenant/landing/navbar";
import TenantFooter from "@/components/tenant/landing/footer";

export const dynamic = "force-dynamic";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "skycare.app";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${ROOT_DOMAIN}`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const host = await getHost();
  const isLocalhost = !host || host === "localhost" || host.startsWith("localhost:");
  const { tenant } = await loadTenant(isLocalhost ? slug : host);
  if (!tenant) return { title: "Hospital" };

  if (tenant.website_enabled === false) {
    return {
      title: tenant.name,
      robots: { index: false, follow: false },
    };
  }

  const tagline = tenant.tagline ?? `${tenant.name} — care you can trust`;
  const about =
    tenant.about ??
    "Quality healthcare for your community. Book an appointment online or call us today.";

  const title = tenant.seo_title ?? `${tenant.name} — ${tagline}`;
  const description = tenant.seo_description ?? about;
  const canonical = `${SITE_URL}/${slug}`;
  const icon = tenant.favicon_url ?? tenant.logo_url;

  return {
    title,
    description,
    icons: icon ? { icon: icon } : undefined,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: tenant.name,
      locale: "en_US",
      type: "website",
      images: tenant.hero_image ?? tenant.logo_url ?? undefined,
    },
  };
}

export default async function TenantSiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  const isLocalhost = !host || host === "localhost" || host.startsWith("localhost:");
  const { tenant } = await loadTenant(isLocalhost ? slug : host);
  if (!tenant) notFound();

  const profile = tenant as TenantSiteProfile;

  if (tenant.website_enabled === false) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center"
        style={{ "--brand": "#0ea5e9" } as CSSProperties}
      >
        <HeartPulse className="mb-4 text-4xl text-sky-400" />
        <h1 className="text-3xl font-bold text-white">{tenant.name}</h1>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          The website for this organization is currently not published.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{ "--brand": "#0F4C81" } as CSSProperties}
      className="min-h-screen bg-[#F7F9FC] text-[#1F2D3D]"
    >
      <TenantNavbar tenant={profile} />
      <main>{children}</main>
      <TenantFooter tenant={profile} />
    </div>
  );
}