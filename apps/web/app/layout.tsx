import type { Metadata } from "next";
import { getSite } from "@/lib/api";
import SiteChrome from "./SiteChrome";
import "./globals.css";
import "./brand.css";
import "./live-images.css";

export const dynamic = "force-dynamic";

const brandMark = "/brand/lelefa-chambers-mark.svg";
const brandLogo = "/brand/lelefa-chambers-logo.svg";

export const metadata: Metadata = {
  title: "Lelefa Chambers | Law for a Brighter Tomorrow",
  description: "Lelefa Chambers provides litigation, debt recovery, commercial, compliance and mediation services in Lesotho.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://lelefachambers.co.ls"),
  icons: {
    icon: [{ url: brandMark, type: "image/svg+xml" }],
    shortcut: brandMark,
    apple: brandMark
  },
  openGraph: {
    title: "Lelefa Chambers | Law for a Brighter Tomorrow",
    description: "Trusted legal strategy, litigation and recovery services in Lesotho.",
    type: "website",
    siteName: "Lelefa Chambers",
    images: [{ url: brandLogo, alt: "Lelefa Chambers" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Lelefa Chambers | Law for a Brighter Tomorrow",
    description: "Trusted legal strategy, litigation and recovery services in Lesotho.",
    images: [brandLogo]
  }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const site = await getSite();
  const contact = site.settings.contact || {};
  const phone = contact.phone || "+266 5776 3829";
  const email = contact.email || "info@lelefachambers.co.ls";

  return (
    <html lang="en">
      <body>
        <SiteChrome phone={phone} email={email}>{children}</SiteChrome>
      </body>
    </html>
  );
}
