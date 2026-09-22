"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import styles from "./staff-login.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "lelefa_chambers_token";

export default function StaffLoginPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    fetch(`${API}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
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
      const response = await fetch(`${API}/api/v1/auth/login`, {
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
      <div className={styles.card}>
        <Link className={styles.brand} href="/">
          <img src="/brand/lelefa-chambers-logo.svg" alt="Lelefa Chambers" />
        </Link>
        <div className={styles.eyebrow}>Secure staff access</div>
        <h1>Staff portal</h1>
        <p>Authorised Chambers staff can sign in to manage website content, consultations, legal operations, recovery workflows and permitted staff accounts.</p>

        <form onSubmit={signIn} className={busy ? styles.loading : ""}>
          <label><span>Email address</span><input name="email" type="email" autoComplete="username" required placeholder="name@lelefachambers.co.ls" /></label>
          <label><span>Password</span><input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
          {message && <div className={styles.error}>{message}</div>}
          <button className="button" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</button>
        </form>

        <div className={styles.securityNote}><strong>Role-based access</strong><span>Your account only exposes the Chambers functions assigned to your staff role.</span></div>
        <Link className={styles.back} href="/">← Return to public website</Link>
      </div>
    </section>
  );
}
