import { notFound } from "next/navigation";
import { getHost, loadTenant } from "@/lib/tenant";
import { createServiceClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/tenant/site-sections";
import BookAppointmentForm from "@/components/tenant/book-form";

export const dynamic = "force-dynamic";

export default async function TenantBookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  const { tenant } = await loadTenant(host ?? slug);
  if (!tenant) notFound();

  const svc = createServiceClient();
  const { data: branches } = await svc
    .from("branches")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });

  return (
    <main>
      <PageHeader
        title="Book an Appointment"
        subtitle="Request a visit in under a minute — our team will confirm by phone."
      />
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_400px]">
            <BookAppointmentForm
              tenantSlug={tenant.slug}
              tenantName={tenant.name}
              branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name }))}
            />
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h3 className="font-semibold">What happens next?</h3>
                <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-slate-600">
                  <li>Submit your request above.</li>
                  <li>Our front desk calls you to confirm the time.</li>
                  <li>Arrive 10 minutes early with your ID.</li>
                  <li>See your doctor — and follow up on your patient portal.</li>
                </ol>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h3 className="font-semibold">Prefer to call?</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {tenant.phone && (
                    <>
                      Call{" "}
                      <a href={`tel:${tenant.phone}`} className="font-semibold [color:var(--brand)] hover:underline">
                        {tenant.phone}
                      </a>
                    </>
                  )}
                  {tenant.emergency_phone && (
                    <>
                      {" "}
                      · Emergency {tenant.emergency_phone}
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
