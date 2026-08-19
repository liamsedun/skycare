/**
 * Animated patient-portal scene for the tenant login page.
 * Ported from the Life-Blossom-style sign-in mock (floaty med icons,
 * bobbing doctor character, blinking eyes, ECG pulse line) and recoloured
 * to the tenant template brand (navy / emerald).
 * Render-only; all motion is CSS keyframes in globals.css.
 */
export default function LoginScene() {
  return (
    <div className="relative flex min-h-[440px] flex-1 flex-col overflow-hidden bg-gradient-to-br from-[#0F4C81] via-[#0B3A63] to-[#071E38] p-8 text-white md:p-10">
      {/* glow blobs */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#16A34A]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />

      <div className="relative z-10">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/85 backdrop-blur-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#16A34A]" />
          Secure patient portal
        </span>
        <h2 className="mt-5 text-3xl font-extrabold leading-tight">Welcome back.</h2>
        <p className="mt-2 max-w-sm text-sm text-white/80">
          Please enter your credentials to manage appointments, bills, results and your family.
        </p>
      </div>

      <div className="relative z-10 mx-auto mt-6 w-full max-w-[260px] flex-1">
        {/* floating med icons + ECG */}
        <svg
          className="tenant-floaty absolute left-0 top-0"
          width="15" height="15" viewBox="0 0 24 24" fill="#fff" opacity="0.85" aria-hidden="true"
        >
          <rect x="10" y="2" width="4" height="20" rx="2" />
          <rect x="2" y="10" width="20" height="4" rx="2" />
        </svg>
        <svg
          className="tenant-floaty tenant-floaty-d2 absolute left-[68%] top-6"
          width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true"
        >
          <path className="tenant-pulse-line" d="M2 12h4l2-7 4 14 3-9 2 4h5" />
        </svg>
        <svg
          className="tenant-floaty tenant-floaty-d3 absolute left-[82%] top-24"
          width="13" height="13" viewBox="0 0 24 24" fill="#fff" opacity="0.8" aria-hidden="true"
        >
          <rect x="10" y="2" width="4" height="20" rx="2" />
          <rect x="2" y="10" width="20" height="4" rx="2" />
        </svg>

        {/* doctor character */}
        <svg className="tenant-bob mx-auto block w-full" viewBox="0 0 220 260" fill="none" aria-hidden="true">
          {/* shadow */}
          <ellipse cx="110" cy="250" rx="70" ry="9" fill="#ffffff" opacity="0.15" />
          {/* legs */}
          <rect x="78" y="185" width="26" height="55" rx="10" fill="#EAF0F7" />
          <rect x="118" y="185" width="26" height="55" rx="10" fill="#EAF0F7" />
          <rect x="74" y="230" width="34" height="16" rx="8" fill="#0F4C81" />
          <rect x="114" y="230" width="34" height="16" rx="8" fill="#0F4C81" />
          {/* coat body */}
          <path d="M60 120c0-22 22-34 50-34s50 12 50 34l6 78c1 10-7 18-17 18H71c-10 0-18-8-17-18l6-78z" fill="#ffffff" />
          {/* coat opening */}
          <path d="M110 92v122" stroke="#DCE4F0" strokeWidth="2" />
          {/* inner scrubs collar */}
          <path d="M96 90c4 10 10 16 14 16s10-6 14-16" stroke="#16A34A" strokeWidth="6" strokeLinecap="round" />
          {/* stethoscope */}
          <path d="M84 96c0 20 6 30 26 30s26-10 26-30" stroke="#0F4C81" strokeWidth="5" strokeLinecap="round" fill="none" />
          <circle cx="110" cy="132" r="7" fill="#0F4C81" />
          {/* arms with gloves */}
          <path d="M62 128c-14 8-22 24-22 42" stroke="#ffffff" strokeWidth="22" strokeLinecap="round" />
          <path d="M158 128c14 8 22 24 22 42" stroke="#ffffff" strokeWidth="22" strokeLinecap="round" />
          <circle cx="38" cy="174" r="13" fill="#34D399" />
          <circle cx="182" cy="174" r="13" fill="#34D399" />
          {/* clipboard */}
          <rect x="168" y="158" width="26" height="34" rx="3" fill="#EAF0F7" stroke="#C7D2E0" strokeWidth="2" />
          <line x1="173" y1="167" x2="189" y2="167" stroke="#93A6BC" strokeWidth="2" />
          <line x1="173" y1="174" x2="189" y2="174" stroke="#93A6BC" strokeWidth="2" />
          <line x1="173" y1="181" x2="184" y2="181" stroke="#93A6BC" strokeWidth="2" />
          {/* neck */}
          <rect x="100" y="76" width="20" height="20" fill="#FFE3D1" />
          {/* head */}
          <circle cx="110" cy="56" r="30" fill="#FFE3D1" />
          {/* scrub cap */}
          <path d="M80 50c0-20 13-33 30-33s30 13 30 33c0 4-2 6-4 6-2-10-8-16-12-16 0 6-4 10-8 10-3 0-5-2-6-6-1 4-3 6-6 6-4 0-8-4-8-10-4 0-10 6-12 16-2 0-4-2-4-6z" fill="#0F4C81" />
          <path d="M79 40c-6 2-9 8-8 14" stroke="#0B3A63" strokeWidth="4" strokeLinecap="round" />
          {/* eyes (blinking) */}
          <g className="tenant-blink">
            <rect x="100" y="54" width="6" height="6" rx="3" fill="#0B3A63" />
            <rect x="116" y="54" width="6" height="6" rx="3" fill="#0B3A63" />
          </g>
          {/* surgical mask */}
          <path d="M92 64c6 6 12 9 18 9s12-3 18-9c2 8-4 16-18 16s-20-8-18-16z" fill="#DCEAF9" stroke="#A9C1F5" strokeWidth="1.5" />
          <path d="M84 60l8 4M136 60l-8 4" stroke="#A9C1F5" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      <div className="relative z-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/70">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" /> Appointments
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" /> Bills &amp; results
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#60A5FA]" /> Family care
        </span>
      </div>
    </div>
  );
}