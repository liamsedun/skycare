import { notFound } from "next/navigation";
import { getHost, loadTenant } from "@/lib/tenant";
import { loadWebsitePage } from "@/lib/tenant-site";
import { PageHeader } from "@/components/tenant/site-sections";

export const dynamic = "force-dynamic";

export default async function TenantAboutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  const { tenant } = await loadTenant(host ?? slug);
  if (!tenant) notFound();

  const cms = await loadWebsitePage(tenant.id, "about");
  const about = tenant.about ?? "Quality healthcare for your community.";
  const paragraphs: string[] =
    Array.isArray(cms?.content.paragraphs) && cms.content.paragraphs.length > 0
      ? (cms.content.paragraphs as string[])
      : [about];

  return (
    <main>
      <PageHeader
        title={cms?.title ?? `About ${tenant.name}`}
        subtitle="Our story, our people, our promise to the community."
      />
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-4">
          {paragraphs.map((p, i) => (
            <p key={i} className="mb-4 leading-relaxed text-slate-700">
              {p}
            </p>
          ))}
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { k: "Years of care", v: "Serving our community with quality healthcare" },
              { k: "Qualified staff", v: "Doctors, nurses & specialists you can trust" },
              { k: "Modern facilities", v: "Laboratory, pharmacy & diagnostic equipment" },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border border-slate-100 p-5 text-center shadow-sm">
                <p className="font-bold [color:var(--brand)]">{s.k}</p>
                <p className="mt-1 text-sm text-slate-600">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
