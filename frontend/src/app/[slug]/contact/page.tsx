import { notFound } from "next/navigation";
import Link from "next/link";
import { getHost, loadTenant } from "@/lib/tenant";
import { ContactCards, PageHeader } from "@/components/tenant/site-sections";

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

  const home = `/${tenant.slug}`;

  return (
    <main>
      <PageHeader
        title="Contact Us"
        subtitle="We are here to help — reach out by phone, email or in person."
      />
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <ContactCards tenant={tenant} />
          <div className="mt-10 rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold">Need an appointment?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Book online in under a minute and our team will confirm by phone.
            </p>
            <Link
              href={`${home}/book`}
              className="mt-5 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white hover:opacity-90 [background:var(--brand)]"
            >
              Book an Appointment
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
