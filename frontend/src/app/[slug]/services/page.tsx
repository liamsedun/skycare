import { notFound } from "next/navigation";
import { getHost, loadTenant } from "@/lib/tenant";
import { DEFAULT_SERVICES, loadWebsiteServices } from "@/lib/tenant-site";
import { PageHeader, ServicesGrid } from "@/components/tenant/site-sections";

export const dynamic = "force-dynamic";

export default async function TenantServicesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  const isLocalhost = !host || host === "localhost" || host.startsWith("localhost:");
  const { tenant } = await loadTenant(isLocalhost ? slug : host);
  if (!tenant) notFound();

  const home = `/${tenant.slug}`;
  const cms = await loadWebsiteServices(tenant.id);
  const services =
    cms.length > 0
      ? cms
      : DEFAULT_SERVICES.map((name, i) => ({
          id: `default-${i}`,
          name,
          description: null,
          icon: null,
          image_url: null,
          display_order: i,
          active: true,
        }));

  return (
    <main>
      <PageHeader
        title="Our Services"
        subtitle="From routine check-ups to specialised care — everything you need under one roof."
      />
      <ServicesGrid services={services} home={home} title="What we offer" />
    </main>
  );
}
