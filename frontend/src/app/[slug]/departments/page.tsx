import { notFound } from "next/navigation";
import { getHost, loadTenant } from "@/lib/tenant";
import { loadWebsiteDepartments } from "@/lib/tenant-site";
import { DepartmentsGrid, PageHeader } from "@/components/tenant/site-sections";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TenantDepartmentsPage({
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
  const departments = await loadWebsiteDepartments(tenant.id);

  return (
    <main>
      <PageHeader
        title="Departments"
        subtitle="Specialised teams, one standard of care."
      />
      <section className="py-16">
        {departments.length > 0 ? (
          <div className="mx-auto max-w-6xl px-4">
            <DepartmentsGrid departments={departments} home={home} />
          </div>
        ) : (
          <div className="mx-auto max-w-xl px-4 text-center">
            <p className="text-slate-600">
              Department information is being updated — in the meantime, reach out to us or
              book an appointment and our team will point you to the right specialist.
            </p>
            <Link
              href={`${home}/book`}
              className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white hover:opacity-90 [background:var(--brand)]"
            >
              <CalendarCheck size={16} /> Book an Appointment
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
