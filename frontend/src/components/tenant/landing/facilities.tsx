const facilities = [
  {
    title: "Private Wards",
    description:
      "Comfortable private rooms with adjustable beds, bedside monitors, call systems, and en-suite bathrooms for a restful recovery.",
    image:
      "https://images.unsplash.com/photo-1778151270902-cb0ca572f2ee?fm=jpg&q=80&w=1200&auto=format&fit=crop",
  },
  {
    title: "Operating Theatre",
    description:
      "State-of-the-art surgical suites with advanced anaesthesia machines, surgical lights, sterilisation units, and patient monitoring systems.",
    image:
      "https://images.pexels.com/photos/11722768/pexels-photo-11722768.jpeg?w=1200&auto=compress",
  },
  {
    title: "Medical Equipment",
    description:
      "Modern diagnostic equipment including ultrasound scanners, ECG machines, digital X-ray, and fully stocked emergency crash carts.",
    image:
      "https://images.unsplash.com/photo-1766299892683-d50398e31823?fm=jpg&q=80&w=1200&auto=format&fit=crop",
  },
  {
    title: "General Ward",
    description:
      "Spacious multi-bed wards with nurse call systems, overhead lighting, piped oxygen, suction, and 24/7 nursing coverage.",
    image:
      "https://images.pexels.com/photos/236380/pexels-photo-236380.jpeg?w=1200&auto=compress",
  },
  {
    title: "Recovery & ICU",
    description:
      "Intensive care units with ventilators, infusion pumps, multi-parameter monitors, and dedicated critical care specialists.",
    image:
      "https://images.unsplash.com/photo-1727830968495-ea2798aaee35?fm=jpg&q=80&w=1200&auto=format&fit=crop",
  },
  {
    title: "Consultation Rooms",
    description:
      "Fully equipped examination rooms with treatment beds, diagnostic tools, and private consultation spaces for doctor-patient discussions.",
    image:
      "https://images.pexels.com/photos/7789603/pexels-photo-7789603.jpeg?w=1200&auto=compress",
  },
];

export default function TenantFacilities() {
  return (
    <section id="facilities" className="relative py-20 md:py-28">
      <div
        className="absolute inset-0 bg-fixed bg-cover bg-center bg-no-repeat opacity-[0.03]"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1766299892683-d50398e31823?fm=jpg&q=60&w=1920&auto=format&fit=crop')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#F7F9FC] via-[#F7F9FC]/95 to-[#F7F9FC]" />
      <div className="relative z-10 mx-auto max-w-7xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-[#EAF4FF] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#0F4C81]">
            Our Facilities
          </span>
          <h2 className="mt-4 text-3xl font-bold text-[#1F2D3D] md:text-4xl">
            Hospital Wards &amp; Equipment
          </h2>
          <p className="mt-3 leading-relaxed text-[#6B7A90]">
            Modern infrastructure and advanced medical equipment to provide you with the highest
            standard of care.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {facilities.map((f) => (
            <div
              key={f.title}
              className="group card-shadow relative overflow-hidden rounded-xl bg-[#ffffff] transition-all duration-300 hover:-translate-y-1 hover:card-shadow-hover"
            >
              <div className="relative h-52 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.image}
                  alt={f.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-all duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <h3 className="absolute bottom-4 left-4 text-lg font-bold text-white">
                  {f.title}
                </h3>
              </div>
              <div className="p-5">
                <p className="text-sm leading-relaxed text-[#6B7A90]">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}