import { Calendar, UserRound } from "lucide-react";
import { type LandingDoctor } from "@/lib/tenant-site";

export default function TenantDoctors({
  doctors,
  home,
  title = "Our Expert Doctors",
}: {
  doctors: LandingDoctor[];
  home: string;
  title?: string;
}) {
  if (doctors.length === 0) return null;
  return (
    <section id="doctors" className="relative py-20 md:py-28">
      <div
        className="absolute inset-0 bg-fixed bg-cover bg-center bg-no-repeat opacity-[0.03]"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1778151270902-cb0ca572f2ee?fm=jpg&q=80&w=1920&auto=format&fit=crop')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#F7F9FC] via-[#F7F9FC]/95 to-[#F7F9FC]" />
      <div className="relative z-10 mx-auto max-w-7xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-[#EAF4FF] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#0F4C81]">
            Our Team
          </span>
          <h2 className="mt-4 text-3xl font-bold text-[#1F2D3D] md:text-4xl">{title}</h2>
          <p className="mt-3 leading-relaxed text-[#6B7A90]">
            Meet our team of highly qualified and compassionate medical professionals dedicated
            to your health.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {doctors.map((doctor) => (
            <div
              key={doctor.id}
              className="group card-shadow rounded-xl bg-[#ffffff] p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:card-shadow-hover"
            >
              <div className="mx-auto h-[120px] w-[120px] overflow-hidden rounded-full bg-gradient-to-br from-[#0F4C81] to-[#0B3A63] shadow-md transition-transform group-hover:scale-105">
                {doctor.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={doctor.image_url} alt={doctor.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    <UserRound size={48} className="text-white/80" />
                  </span>
                )}
              </div>
              <h3 className="mt-5 text-lg font-semibold text-[#1F2D3D]">{doctor.name}</h3>
              <p className="text-sm text-[#6B7A90]">{doctor.specialty}</p>

              <span
                className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  doctor.available ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#FEF3C7] text-[#F39C12]"
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    doctor.available ? "bg-[#16A34A]" : "bg-[#F39C12]"
                  }`}
                />
                {doctor.available ? "Available" : "Limited Availability"}
              </span>

              {doctor.availability && (
                <p className="mt-3 text-xs text-[#6B7A90]">{doctor.availability}</p>
              )}

              <a
                href={`${home}/book`}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#EAF4FF] px-4 py-2.5 text-xs font-semibold text-[#0F4C81] transition-all hover:bg-[#0F4C81] hover:text-white"
              >
                <Calendar size={14} />
                Book Appointment
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}