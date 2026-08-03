import type { Metadata, Viewport } from "next";
import { Figtree, Noto_Sans } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading",
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
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${notoSans.variable} antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen font-[family-name:var(--font-sans)]"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}