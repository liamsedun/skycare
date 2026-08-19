export default function TenantClinicBanner() {
  return (
    <section className="relative h-[400px] overflow-hidden md:h-[500px]">
      <div
        className="absolute inset-0 scale-110 bg-cover bg-center bg-fixed bg-no-repeat"
        style={{
          backgroundImage:
            "url('https://images.pexels.com/photos/11722768/pexels-photo-11722768.jpeg?w=1920&auto=compress')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0F4C81]/80 via-[#0F4C81]/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
      <div className="relative z-10 mx-auto flex h-full max-w-7xl items-center px-5">
        <div className="max-w-xl">
          <span className="inline-block rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/90 backdrop-blur-md">
            Why Choose Us
          </span>
          <h2 className="mt-4 text-3xl font-bold leading-tight text-white md:text-5xl">
            Experienced &amp; Certified Doctors
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/80 md:text-lg">
            24/7 Emergency &amp; Intensive Care — We are always here for you with cutting-edge
            medical facilities and compassionate professionals.
          </p>
          <div className="mt-6 flex gap-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#16A34A]" />
              <span className="text-sm text-white/75">24/7 Emergency</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#16A34A]" />
              <span className="text-sm text-white/75">Expert Team</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#16A34A]" />
              <span className="text-sm text-white/75">Modern Facilities</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}