import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import { Inter, Noto_Sans } from "next/font/google";
import Script from "next/script";
import PwaWrapper from "@/components/pwa/pwa-wrapper";
import ThemeSync from "@/components/theme-sync";
import { readCookieTheme } from "@/lib/theme";
import "./globals.css";

const figtree = localFont({
  src: [
    { path: "./fonts/figtree-latin.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/figtree-latinext.woff2", weight: "400 700", style: "normal" },
  ],
  variable: "--font-heading",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "SkyCare — The Smart Hospital OS for Africa",
  description:
    "SkyCare is the multi-tenant hospital management SaaS by Skyhouse Technologies. EHR, billing, pharmacy, lab, ward & bed management, HR, analytics — plus a free hospital website and patient app.",
  keywords: [
    "hospital management system",
    "HMS",
    "SkyCare",
    "Skyhouse Technologies",
    "hospital software Nigeria",
    "EHR",
    "patient management",
    "pharmacy software",
    "clinic management",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SkyCare",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
    other: [
      {
        rel: "mask-icon",
        url: "/favicon.svg",
        color: "#0b0b0f",
      },
    ],
  },
  openGraph: {
    title: "SkyCare — The Smart Hospital OS for Africa",
    description:
      "EHR, billing, pharmacy, lab, wards, HR and analytics for African hospitals. Every hospital gets a free website and patient app.",
    type: "website",
    locale: "en_NG",
  },
  twitter: {
    card: "summary",
    title: "SkyCare — The Smart Hospital OS for Africa",
    description:
      "EHR, billing, pharmacy, lab, wards, HR and analytics for African hospitals. Every hospital gets a free website and patient app.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0ea5e9",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const theme = readCookieTheme(cookieStore.get("skycare-theme")?.value);

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${figtree.variable} ${inter.variable} ${notoSans.variable} antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen font-[family-name:var(--font-inter)]"
        suppressHydrationWarning
      >
        <Script id="block-netlify-badge" strategy="beforeInteractive">
          {`try{customElements.define('netlify-badge',class extends HTMLElement{})}catch(e){}setInterval(function(){document.querySelectorAll('netlify-badge,[id*="netlify-badge"]').forEach(function(e){e.remove()})},200);`}
        </Script>
        <PwaWrapper>{children}</PwaWrapper>
        <ThemeSync />
      </body>
    </html>
  );
}