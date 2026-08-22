import { notFound } from "next/navigation";
import { getHost, loadTenant } from "@/lib/tenant";
import TenantContact from "@/components/tenant/landing/contact";

export const dynamic = "force-dynamic";

export default async function TenantContactPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  const isLocalhost = !host || host === "localhost" || host.startsWith("localhost:");
  const { tenant } = await loadTenant(isLocalhost ? slug : host);
  if (!tenant) notFound();

  return (
    <main>
      <TenantContact tenant={tenant} />
    </main>
  );
}
