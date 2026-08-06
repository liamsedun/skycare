/**
 * Official brand mark SVGs for the login page OAuth buttons.
 * Paths are the standard, widely-used brand glyphs (Google "G", Yahoo "Yahoo!",
 * Apple logo, iCloud cloud). Rendered inline — no external assets.
 */

export function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function YahooLogo({ size = 18, className = "" }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/images/Yahoo.png" alt="Yahoo" width={size} height={size} className={className} />;
}

export function AppleLogo({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 384 512" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </svg>
  );
}

export function FacebookLogo({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 320 512" className={className} aria-hidden="true">
      <path
        fill="#1877F2"
        d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z"
      />
    </svg>
  );
}

export function ICloudLogo({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="icloud-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#74b9ff" />
          <stop offset="100%" stopColor="#3b6fd4" />
        </linearGradient>
      </defs>
      <path
        fill="url(#icloud-g)"
        d="M46 14.2c-4.4 0-8.2 2.3-10.3 5.7-1.6-.7-3.4-1.1-5.3-1.1-7.4 0-13.4 6-13.4 13.4 0 1 .1 2 .3 2.9H16C9.4 35.1 4 29.7 4 23.1c0-6.2 4.7-11.3 10.7-12.1C17.1 6.3 22.2 3 28 3c7.2 0 13.2 4.7 15.3 11.2h2.7z"
      />
    </svg>
  );
}
