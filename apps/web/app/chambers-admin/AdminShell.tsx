"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "./admin-shell.module.css";

const TOKEN_KEY = "lelefa_chambers_token";

type SessionUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
};

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: "grid" | "people" | "briefcase" | "recovery" | "automation";
};

const navItems: NavItem[] = [
  { href: "/chambers-admin", label: "Overview", description: "Website & content", icon: "grid" },
  { href: "/chambers-admin/staff", label: "Staff", description: "People & access", icon: "people" },
  { href: "/chambers-admin/operations", label: "Legal Operations", description: "Clients & matters", icon: "briefcase" },
  { href: "/chambers-admin/recovery", label: "Recovery", description: "Payments & execution", icon: "recovery" },
  { href: "/chambers-admin/automation", label: "Automation", description: "Workflows & Ithute Pay", icon: "automation" },
];

const pageMeta: Array<{ prefix: string; title: string; eyebrow: string }> = [
  { prefix: "/chambers-admin/staff", title: "Staff Management", eyebrow: "People & access" },
  { prefix: "/chambers-admin/operations", title: "Legal Operations", eyebrow: "Matters & casework" },
  { prefix: "/chambers-admin/recovery", title: "Recovery Workspace", eyebrow: "Recovery & institutional clients" },
  { prefix: "/chambers-admin/automation", title: "Automation", eyebrow: "Workflow control" },
  { prefix: "/chambers-admin", title: "Administration Overview", eyebrow: "Chambers control centre" },
];

function Icon({ name }: { name: NavItem["icon"] }) {
  if (name === "people") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === "briefcase") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>;
  if (name === "recovery") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v10M15 9.5c0-1.1-1.3-2-3-2s-3 .9-3 2 1.3 2 3 2 3 .9 3 2-1.3 2-3 2-3-.9-3-2"/></svg>;
  if (name === "automation") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
}

function initials(name?: string) {
  if (!name) return "LC";
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  const meta = useMemo(
    () => pageMeta.find((item) => pathname.startsWith(item.prefix)) || pageMeta[pageMeta.length - 1],
    [pathname]
  );

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    fetch("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session unavailable");
        setUser(await response.json());
      })
      .catch(() => setUser(null));
  }, [pathname]);

  function active(href: string) {
    if (href === "/chambers-admin") return pathname === href;
    return pathname.startsWith(href);
  }

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.replace("/staff-login");
  }

  return (
    <div className={styles.appShell}>
      <button
        type="button"
        className={`${styles.overlay} ${menuOpen ? styles.overlayVisible : ""}`}
        aria-label="Close administration navigation"
        onClick={() => setMenuOpen(false)}
      />

      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brandBlock}>
          <Link href="/chambers-admin" className={styles.brandLink}>
            <span className={styles.brandMark}><img src="/brand/lelefa-chambers-mark.svg" alt="" /></span>
            <span className={styles.brandWords}>
              <strong>Lelefa Chambers</strong>
              <small>Administration</small>
            </span>
          </Link>
          <button type="button" className={styles.closeMenu} onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button>
        </div>

        <div className={styles.workspaceLabel}>Workspace</div>
        <nav className={styles.nav} aria-label="Administration navigation">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={`${styles.navItem} ${active(item.href) ? styles.navActive : ""}`}>
              <span className={styles.navIcon}><Icon name={item.icon} /></span>
              <span className={styles.navCopy}><strong>{item.label}</strong><small>{item.description}</small></span>
              <span className={styles.navArrow}>›</span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.securityCard}>
            <span className={styles.securityDot} />
            <div><strong>Secure staff environment</strong><small>Role-based access & audited changes</small></div>
          </div>
          <Link href="/" className={styles.publicLink}>← View public website</Link>
          <a href="https://ithute.co.ls" target="_blank" rel="noreferrer" className={styles.developer}>Developed by <strong>Ithute Digital Solutions</strong></a>
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button type="button" className={styles.menuButton} onClick={() => setMenuOpen(true)} aria-label="Open administration navigation">
              <span /><span /><span />
            </button>
            <div>
              <span className={styles.pageEyebrow}>{meta.eyebrow}</span>
              <h1>{meta.title}</h1>
            </div>
          </div>

          <div className={styles.topbarRight}>
            <div className={styles.systemStatus}><span />System online</div>
            <div className={styles.userMenu}>
              <span className={styles.userAvatar}>{initials(user?.full_name)}</span>
              <div className={styles.userCopy}>
                <strong>{user?.full_name || "Chambers Staff"}</strong>
                <small>{user?.role ? user.role.replaceAll("_", " ") : "Secure session"}</small>
              </div>
              <button type="button" onClick={signOut} className={styles.logout}>Sign out</button>
            </div>
          </div>
        </header>

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
