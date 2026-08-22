import { notFound } from "next/navigation";
import { getHost, isLocalHost, loadTenant } from "@/lib/tenant";
import { loadLandingDoctors } from "@/lib/tenant-site";
import { DoctorsGrid, PageHeader } from "@/components/tenant/site-sections";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TenantDoctorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  const isLocalhost = isLocalHost(host);
  const { tenant } = await loadTenant(isLocalhost ? slug : host);
  if (!tenant) notFound();

  const home = `/${tenant.slug}`;
  const doctors = await loadLandingDoctors(tenant.id);

  return (
    <main>
      <PageHeader
        title="Meet Our Doctors"
        subtitle="Qualified, compassionate and ready to care for you."
      />
      <section className="py-16">
        {doctors.length > 0 ? (
          <div className="mx-auto max-w-6xl px-4">
            <DoctorsGrid doctors={doctors} home={home} />
          </div>
        ) : (
          <div className="mx-auto max-w-xl px-4 text-center">
            <p className="text-slate-600">
              Our doctors&apos; profiles are being updated — book an appointment and our
              front desk will match you with the right clinician.
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
