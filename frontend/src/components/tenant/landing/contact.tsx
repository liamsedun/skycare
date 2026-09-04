import { Calendar, Clock, Globe, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { tenantAddress, tenantWhatsApp, type TenantSiteProfile } from "@/lib/tenant-site";

export default function TenantContact({ tenant }: { tenant: TenantSiteProfile }) {
  const address = tenantAddress(tenant);
  const whatsapp = tenantWhatsApp(tenant);
  const home = `/${tenant.slug}`;
  const mapUrl = address
    ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
    : null;

  return (
    <section id="contact" className="relative py-20 md:py-28">
      <div
        className="absolute inset-0 bg-fixed bg-cover bg-center bg-no-repeat opacity-[0.04]"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1766299892683-d50398e31823?fm=jpg&q=80&w=1920&auto=format&fit=crop')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#F7F9FC] via-[#F7F9FC]/95 to-[#F7F9FC]" />
      <div className="relative z-10 mx-auto max-w-7xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-[#EAF4FF] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#0F4C81]">
            Get in Touch
          </span>
          <h2 className="mt-4 text-3xl font-bold text-[#1F2D3D] md:text-4xl">Contact Us</h2>
          <p className="mt-3 leading-relaxed text-[#6B7A90]">
            We&apos;re here to help. Reach out to us through any of the channels below.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          {mapUrl && (
            <div className="card-shadow overflow-hidden rounded-xl">
              <iframe
                title="Hospital Location"
                src={mapUrl}
                width="100%"
                height="100%"
                className="min-h-[300px] lg:min-h-[400px]"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}

          <div
            className={
              "flex flex-col justify-center gap-6 rounded-xl bg-[#ffffff] p-8 card-shadow" +
              (mapUrl ? "" : " lg:col-start-1 lg:col-end-3 lg:mx-auto lg:w-full lg:max-w-2xl")
            }
          >
            <h3 className="text-xl font-bold text-[#1F2D3D]">Visit or Reach Us</h3>

            <div className="space-y-5">
              {address && (
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EAF4FF] text-[#0F4C81]">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1F2D3D]">Address</p>
                    <p className="text-sm text-[#6B7A90]">{address}</p>
                  </div>
                </div>
              )}

              {(tenant.phone || tenant.emergency_phone) && (
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EAF4FF] text-[#0F4C81]">
                    <Phone size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1F2D3D]">Phone</p>
                    {tenant.phone && (
                      <a href={`tel:${tenant.phone}`} className="block text-sm text-[#6B7A90] hover:text-[#0F4C81]">
                        {tenant.phone}
                      </a>
                    )}
                    {tenant.emergency_phone && (
                      <a href={`tel:${tenant.emergency_phone}`} className="block text-sm text-[#6B7A90] hover:text-[#0F4C81]">Emergency: {tenant.emergency_phone}</a>
                    )}
                  </div>
                </div>
              )}

              {tenant.email && (
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EAF4FF] text-[#0F4C81]">
                    <Mail size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1F2D3D]">Email</p>
                    <a
                      href={`mailto:${tenant.email}`}
                      className="block text-sm text-[#6B7A90] hover:text-[#0F4C81]"
                    >
                      {tenant.email}
                    </a>
                  </div>
                </div>
              )}

              {tenant.website_url && (
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EAF4FF] text-[#0F4C81]">
                    <Globe size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1F2D3D]">Website</p>
                    <a
                      href={tenant.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#6B7A90] transition-colors hover:text-[#0F4C81]"
                    >
                      {tenant.website_url.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                  </div>
                </div>
              )}

              {tenant.opening_hours && (
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EAF4FF] text-[#0F4C81]">
                    <Clock size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1F2D3D]">Working Hours</p>
                    {Object.entries(tenant.opening_hours)
                      .filter(([, v]) => v)
                      .map(([key, value]) => (
                        <p key={key} className="text-sm capitalize text-[#6B7A90]">
                          {key.replace("_", " ")} · {value}
                        </p>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#16A34A] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#16A34A]/25 transition-all hover:bg-[#15803d] hover:shadow-xl hover:shadow-[#16A34A]/30 active:scale-[0.97]"
              >
                <MessageCircle size={18} />
                Chat with Us on WhatsApp
              </a>
            )}
            {!whatsapp && tenant.phone && (
              <a
                href={`tel:${tenant.phone}`}
                className="mt-2 inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#16A34A] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#16A34A]/25 transition-all hover:bg-[#15803d] hover:shadow-xl hover:shadow-[#16A34A]/30 active:scale-[0.97]"
              >
                <Phone size={18} />
                Call {tenant.name}
              </a>
            )}
            <a
              href={`${home}/book`}
              className="inline-flex items-center justify-center gap-2.5 rounded-xl border-2 border-[#0F4C81]/20 px-6 py-3.5 text-sm font-semibold text-[#0F4C81] transition-all hover:bg-[#0F4C81] hover:text-white active:scale-[0.97]"
            >
              <Calendar size={18} />
              Book an Appointment Online
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}