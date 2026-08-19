const images = [
  {
    src: "https://images.unsplash.com/photo-1764727291644-5dcb0b1a0375?fm=jpg&q=80&w=1200&auto=format&fit=crop",
    alt: "Hospital Reception Area",
  },
  {
    src: "https://images.unsplash.com/photo-1766299892683-d50398e31823?fm=jpg&q=80&w=1200&auto=format&fit=crop",
    alt: "Hospital Modern Equipment",
  },
  {
    src: "https://images.unsplash.com/photo-1778151270902-cb0ca572f2ee?fm=jpg&q=80&w=1200&auto=format&fit=crop",
    alt: "Private Ward Room",
  },
  {
    src: "https://images.pexels.com/photos/236380/pexels-photo-236380.jpeg?w=1200&auto=compress",
    alt: "Hospital Ward & Beds",
  },
];

export default function TenantGallery({ title = "Take a Look Inside" }: { title?: string }) {
  return (
    <section className="overflow-hidden bg-[#0B2A4A] py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/70">
            Our Facility
          </span>
          <h2 className="mt-4 text-3xl font-bold text-white md:text-4xl">{title}</h2>
          <p className="mt-3 leading-relaxed text-white/60">
            Modern, clean, and equipped with cutting-edge technology — our facility is designed
            for your comfort and care.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {images.map((img, i) => (
            <div
              key={i}
              className="group card-shadow relative aspect-[4/3] overflow-hidden rounded-2xl"
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition-all duration-700 group-hover:scale-110"
                style={{ backgroundImage: `url('${img.src}')` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute bottom-0 left-0 right-0 translate-y-4 p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                <p className="text-sm font-medium text-white drop-shadow-md">{img.alt}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}