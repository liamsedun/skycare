import { serviceIcon, type WebsiteService } from "@/lib/tenant-site";

export default function TenantServices({
  services,
  title = "Our Medical Services",
}: {
  services: WebsiteService[];
  title?: string;
}) {
  if (services.length === 0) return null;
  return (
    <section id="services" className="bg-[#F7F9FC] py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-[#EAF4FF] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#0F4C81]">
            Our Specialized Services
          </span>
          <h2 className="mt-4 text-3xl font-bold text-[#1F2D3D] md:text-4xl">{title}</h2>
          <p className="mt-3 leading-relaxed text-[#6B7A90]">
            We offer professional medical services with the latest technology, delivered by our
            team of expert doctors and compassionate caregivers.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = serviceIcon(service.icon);
            return (
              <div
                key={service.id}
                className="group card-shadow rounded-xl bg-[#ffffff] p-6 transition-all duration-300 hover:-translate-y-1 hover:card-shadow-hover md:p-7"
              >
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#0F4C81] transition-colors group-hover:bg-[#0F4C81] group-hover:text-white">
                  <Icon size={28} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-[#1F2D3D]">{service.name}</h3>
                {service.description && (
                  <p className="mt-2 text-sm leading-relaxed text-[#6B7A90]">
                    {service.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}