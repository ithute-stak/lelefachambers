import type { Metadata } from "next";
import Link from "next/link";
import { getSite } from "@/lib/api";
import "./globals.css";

export const dynamic = "force-dynamic";

const brandMark = "/brand/lelefa-chambers-mark.png";
const brandLogo = "/brand/lelefa-chambers-logo.webp";

export const metadata: Metadata = {
  title: "Lelefa Chambers | Legal Strategy. Litigation. Recovery.",
  description: "Lelefa Chambers provides litigation, debt recovery, commercial, compliance and mediation services in Lesotho.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://lelefachambers.co.ls"),
  icons: {
    icon: [{ url: brandMark, type: "image/png" }],
    shortcut: brandMark,
    apple: brandMark
  },
  openGraph: {
    title: "Lelefa Chambers | Legal Strategy. Litigation. Recovery.",
    description: "Lelefa Chambers provides litigation, debt recovery, commercial, compliance and mediation services in Lesotho.",
    type: "website",
    siteName: "Lelefa Chambers",
    images: [{ url: brandLogo, alt: "Lelefa Chambers" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Lelefa Chambers | Legal Strategy. Litigation. Recovery.",
    description: "Legal strategy, litigation and recovery services in Lesotho.",
    images: [brandLogo]
  }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const site = await getSite();
  const contact = site.settings.contact || {};
  const pages = site.pages
    .filter((page) => page.show_in_navigation && page.slug !== "home")
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <html lang="en">
      <body>
        <div className="topbar">
          <div className="shell topbar-inner">
            <span>Maseru, Lesotho</span>
            <div className="topbar-links">
              <Link href="/client-portal">Institutional Client Portal</Link>
              <a href={`tel:${String(contact.phone || "").replace(/\s/g, "")}`}>{contact.phone || "+266 5776 3829"}</a>
              <a href={`mailto:${contact.email || "info@lelefachambers.co.ls"}`}>{contact.email || "info@lelefachambers.co.ls"}</a>
            </div>
          </div>
        </div>
        <header className="site-header">
          <div className="shell nav-shell">
            <Link className="brand" href="/" aria-label="Lelefa Chambers home">
              <img className="brand-mark-image" src={brandMark} alt="" width={54} height={54} />
              <span className="brand-copy">
                <strong>Lelefa Chambers</strong>
                <small>Advocates • Lesotho</small>
              </span>
            </Link>
            <nav className="nav-links" aria-label="Primary navigation">
              <Link href="/">Home</Link>
              <Link href="/practice-areas">Practice Areas</Link>
              <Link href="/our-team">Our Team</Link>
              {pages.filter((page) => !["about", "contact"].includes(page.slug)).map((page) => (
                <Link href={`/${page.slug}`} key={page.slug}>{page.nav_label || page.title}</Link>
              ))}
              <Link href="/insights">Insights</Link>
              <Link href="/about">About</Link>
            </nav>
            <Link className="button button-small" href="/contact">Request consultation</Link>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div className="shell footer-grid">
            <div>
              <div className="footer-logo-wrap">
                <img className="footer-logo" src={brandLogo} alt="Lelefa Chambers — Law for a brighter tomorrow" />
              </div>
              <p>Professional legal representation, dispute resolution and controlled legal-recovery services in Lesotho.</p>
            </div>
            <div>
              <h3>Practice</h3>
              <Link href="/practice-areas">Practice Areas</Link>
              <Link href="/institutional-recovery">Financial Institutions</Link>
              <Link href="/insights">Legal Insights</Link>
            </div>
            <div>
              <h3>Chambers</h3>
              <Link href="/about">About</Link>
              <Link href="/our-team">Our Team</Link>
              <Link href="/contact">Contact</Link>
              <Link href="/client-portal">Institutional Client Portal</Link>
            </div>
            <div>
              <h3>Contact</h3>
              <a href={`mailto:${contact.email || "info@lelefachambers.co.ls"}`}>{contact.email || "info@lelefachambers.co.ls"}</a>
              <a href={`tel:${String(contact.phone || "+266 5776 3829").replace(/\s/g, "")}`}>{contact.phone || "+266 5776 3829"}</a>
              <span>{contact.address || "Maseru, Lesotho"}</span>
            </div>
          </div>
          <div className="shell footer-bottom">
            <span>© {new Date().getFullYear()} Lelefa Chambers. All rights reserved.</span>
            <span>Legal information on this website is general and does not create a lawyer-client relationship.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
