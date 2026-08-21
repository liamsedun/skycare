import { notFound } from "next/navigation";
import { getHost, loadTenant } from "@/lib/tenant";
import {
  DEFAULT_SERVICES,
  loadLandingDoctors,
  loadWebsiteServices,
  type TenantSiteProfile,
} from "@/lib/tenant-site";
import TenantHero from "@/components/tenant/landing/hero";
import TenantServices from "@/components/tenant/landing/services";
import TenantClinicBanner from "@/components/tenant/landing/clinic-banner";
import TenantGallery from "@/components/tenant/landing/gallery";
import TenantFacilities from "@/components/tenant/landing/facilities";
import TenantDoctors from "@/components/tenant/landing/doctors";
import TenantTestimonials from "@/components/tenant/landing/testimonials";
import TenantHealthTips from "@/components/tenant/landing/health-tips";
import TenantContact from "@/components/tenant/landing/contact";

export const dynamic = "force-dynamic";

export default async function TenantWebsitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  // On localhost, getHost() returns "localhost" — use the slug from the URL.
  const isLocalhost = !host || host === "localhost" || host.startsWith("localhost:");
  const { tenant } = await loadTenant(isLocalhost ? slug : host);
  if (!tenant) notFound();

  const profile = tenant as TenantSiteProfile;
  const home = `/${tenant.slug}`;

  const cmsServices = await loadWebsiteServices(tenant.id);
  const services =
    cmsServices.length > 0
      ? cmsServices
      : DEFAULT_SERVICES.map((name, i) => ({
          id: `default-${i}`,
          name,
          description: null,
          icon: null,
          image_url: null,
          display_order: i,
          active: true,
        }));

  const doctors = await loadLandingDoctors(tenant.id);

  const stats = [
    { value: `${services.length}+`, label: "Medical Services" },
    { value: `${doctors.length}+`, label: "Expert Doctors" },
    { value: "24/7", label: "Emergency Care" },
    { value: "100%", label: "Commitment to Care" },
  ];

  return (
    <main>
      <TenantHero tenant={profile} stats={stats} />
      <TenantServices services={services} />
      <TenantClinicBanner />
      <TenantGallery />
      <TenantFacilities />
      <TenantDoctors doctors={doctors} home={home} />
      <TenantTestimonials />
      <TenantHealthTips />
      <TenantContact tenant={profile} />
    </main>
  );
}