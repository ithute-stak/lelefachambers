"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import styles from "./staff-login.module.css";

const TOKEN_KEY = "lelefa_chambers_token";

export default function StaffLoginPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    fetch("/api/staff-auth/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      .then((response) => {
        if (response.ok) window.location.replace("/chambers-admin");
        else window.localStorage.removeItem(TOKEN_KEY);
      })
      .catch(() => undefined);
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/staff-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Unable to sign in");
      window.localStorage.setItem(TOKEN_KEY, data.access_token);
      window.location.replace("/chambers-admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in");
      setBusy(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.intro}>
          <Link className={styles.brand} href="/" aria-label="Lelefa Chambers home">
            <img src="/brand/lelefa-chambers-logo.svg" alt="Lelefa Chambers" />
          </Link>
          <div className={styles.kicker}>Private Chambers workspace</div>
          <h1>Secure access for the people running the practice.</h1>
          <p className={styles.lead}>Staff access to legal operations, recovery workflows, consultations, publishing and administration is controlled by role and recorded for accountability.</p>
          <div className={styles.features}>
            <div><span>01</span><strong>Role-based access</strong><small>Each account sees only the functions assigned to its role.</small></div>
            <div><span>02</span><strong>Audited activity</strong><small>Administrative changes and key actions are recorded.</small></div>
            <div><span>03</span><strong>Single staff workspace</strong><small>Website, matters, recovery and staff administration in one place.</small></div>
          </div>
          <div className={styles.trustLine}>Lelefa Chambers · Maseru, Lesotho</div>
        </div>

        <div className={styles.loginPanel}>
          <div className={styles.panelTop}>
            <div className={styles.markWrap}><img src="/brand/lelefa-chambers-mark.svg" alt="" /></div>
            <div><span>Authorised personnel only</span><strong>Staff sign in</strong></div>
          </div>

          <form onSubmit={signIn} className={busy ? styles.loading : ""}>
            <label>
              <span>Email address</span>
              <input name="email" type="email" autoComplete="username" required placeholder="info@lelefachambers.co.ls" />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" minLength={8} required placeholder="Enter your password" />
            </label>
            {message && <div className={styles.error} role="alert">{message}</div>}
            <button className={styles.submit} disabled={busy}>{busy ? "Signing in…" : "Sign in to Staff Portal"}<b>→</b></button>
          </form>

          <div className={styles.help}>Having trouble signing in? Contact the Chambers system administrator.</div>
          <div className={styles.panelFoot}>
            <span>Protected staff environment</span>
            <Link href="/">Return to website</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
