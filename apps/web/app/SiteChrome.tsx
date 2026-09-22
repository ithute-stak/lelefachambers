"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const brandLogo = "/brand/lelefa-chambers-logo.svg";
const developerMark = "/brand/ithute-digital-solutions-mark.svg";

type Props = {
  children: React.ReactNode;
  phone: string;
  email: string;
};

export default function SiteChrome({ children, phone, email }: Props) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/chambers-admin");

  if (isAdmin) return <>{children}</>;

  return (
    <>
      <div className="topbar">
        <div className="shell topbar-inner">
          <div className="topbar-group">
            <span>● Maseru, Lesotho</span>
            <a href={`tel:${String(phone).replace(/\s/g, "")}`}>☎ {phone}</a>
            <a href={`mailto:${email}`}>✉ {email}</a>
          </div>
          <div className="topbar-group topbar-right">
            <span>Law for a Brighter Tomorrow</span>
            <Link href="/client-portal">Client Portal</Link>
            <Link href="/staff-login">Staff Portal</Link>
          </div>
        </div>
      </div>

      <header className="site-header">
        <div className="shell nav-shell">
          <Link className="brand" href="/" aria-label="Lelefa Chambers home">
            <img className="header-logo" src={brandLogo} alt="Lelefa Chambers" />
          </Link>

          <nav className="nav-links" aria-label="Primary navigation">
            <Link href="/">Home</Link>
            <Link href="/about">About</Link>
            <Link href="/practice-areas">Practice Areas</Link>
            <Link href="/our-team">Our Team</Link>
            <Link href="/institutional-recovery">Financial Institutions</Link>
            <Link href="/insights">Insights</Link>
            <Link href="/contact">Contact</Link>
          </nav>

          <Link className="button button-small nav-cta" href="/contact">Request consultation <span>→</span></Link>

          <details className="mobile-menu">
            <summary aria-label="Open navigation"><span></span><span></span><span></span></summary>
            <div className="mobile-menu-panel">
              <Link href="/">Home</Link>
              <Link href="/about">About</Link>
              <Link href="/practice-areas">Practice Areas</Link>
              <Link href="/our-team">Our Team</Link>
              <Link href="/institutional-recovery">Financial Institutions</Link>
              <Link href="/insights">Insights</Link>
              <Link href="/contact">Contact</Link>
              <Link href="/staff-login">Staff Portal</Link>
              <Link className="button" href="/contact">Request consultation</Link>
            </div>
          </details>
        </div>
      </header>

      <main>{children}</main>

      <footer className="footer">
        <div className="shell footer-grid">
          <div className="footer-intro">
            <img className="footer-logo" src={brandLogo} alt="Lelefa Chambers — Law for a brighter tomorrow" />
            <p>Professional legal representation, dispute resolution and controlled legal-recovery services for individuals, businesses and institutions in Lesotho.</p>
          </div>
          <div>
            <h3>Quick links</h3>
            <Link href="/">Home</Link>
            <Link href="/about">About Us</Link>
            <Link href="/our-team">Our Team</Link>
            <Link href="/insights">Insights</Link>
          </div>
          <div>
            <h3>Practice</h3>
            <Link href="/practice-areas">Practice Areas</Link>
            <Link href="/institutional-recovery">Financial Institutions</Link>
            <Link href="/client-portal">Client Portal</Link>
            <Link href="/staff-login">Staff Portal</Link>
          </div>
          <div>
            <h3>Contact</h3>
            <span>Maseru, Lesotho</span>
            <a href={`tel:${String(phone).replace(/\s/g, "")}`}>{phone}</a>
            <a href={`mailto:${email}`}>{email}</a>
            <Link href="/contact">Request consultation →</Link>
          </div>
        </div>
        <div className="shell footer-bottom">
          <span>© {new Date().getFullYear()} Lelefa Chambers. All rights reserved.</span>
          <span>Legal information on this website is general and does not create a lawyer-client relationship.</span>
          <a className="developer-credit" href="https://ithute.co.ls" target="_blank" rel="noreferrer" aria-label="Website designed and developed by Ithute Digital Solutions">
            <span className="developer-credit-label">Designed &amp; developed by</span>
            <img src={developerMark} alt="" aria-hidden="true" />
            <strong>Ithute Digital Solutions</strong>
          </a>
        </div>
      </footer>

      <nav className="mobile-bottom-nav" aria-label="Mobile quick navigation">
        <Link href="/"><span>⌂</span>Home</Link>
        <Link href="/practice-areas"><span>⚖</span>Practice</Link>
        <Link href="/our-team"><span>◉</span>Our Team</Link>
        <Link href="/contact"><span>☎</span>Contact</Link>
      </nav>
    </>
  );
}
