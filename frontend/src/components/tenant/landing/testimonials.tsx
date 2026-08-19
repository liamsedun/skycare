import { Quote, Star } from "lucide-react";

const testimonials = [
  {
    name: "Grace A.",
    quote:
      "The care I received was outstanding. From the warm welcome at reception to the thorough consultation with my doctor, every moment was handled with professionalism and compassion.",
    rating: 5,
  },
  {
    name: "Chuka M.",
    quote:
      "I brought my son in for an emergency late at night and the team was incredibly fast and efficient. They stabilized him within minutes. I will forever be grateful for their swift response.",
    rating: 5,
  },
  {
    name: "Fatima D.",
    quote:
      "The maternity wing is simply wonderful. The nurses cheered me on through delivery and made sure I was comfortable throughout my stay. It felt like family.",
    rating: 5,
  },
  {
    name: "Samuel T.",
    quote:
      "After years of searching for answers to my health challenges, the diagnostic team finally identified the issue. Their advanced equipment and skilled staff made all the difference.",
    rating: 5,
  },
];

export default function TenantTestimonials() {
  return (
    <section className="relative py-20 md:py-28">
      <div
        className="absolute inset-0 bg-fixed bg-cover bg-center bg-no-repeat opacity-[0.03]"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1777269749032-d8d458ae594d?fm=jpg&q=60&w=1920&auto=format&fit=crop')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#F7F9FC] via-[#F7F9FC]/95 to-[#F7F9FC]" />
      <div className="mx-auto max-w-7xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-[#EAF4FF] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#0F4C81]">
            Testimonials
          </span>
          <h2 className="mt-4 text-3xl font-bold text-[#1F2D3D] md:text-4xl">
            What Our Patients Say
          </h2>
          <p className="mt-3 leading-relaxed text-[#6B7A90]">
            Real stories from the people we&apos;ve had the privilege to care for.
          </p>
        </div>

        <div className="mt-12 flex gap-6 overflow-x-auto scrollbar-none pb-4 snap-x snap-mandatory">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="group card-shadow relative min-w-[300px] flex-1 snap-start rounded-xl bg-[#ffffff] p-7 transition-all duration-300 hover:card-shadow-hover md:min-w-[340px]"
            >
              <Quote size={28} className="absolute right-5 top-5 text-[#E5EAF0]" />

              <div className="flex gap-1">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} size={16} className="fill-[#F39C12] text-[#F39C12]" />
                ))}
              </div>

              <p className="mt-4 text-sm italic leading-relaxed text-[#6B7A90]">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className="mt-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#0F4C81] to-[#0B3A63] text-xs font-bold text-white">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2D3D]">{t.name}</p>
                  <p className="text-xs text-[#6B7A90]">Patient</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}