"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./staff.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "lelefa_chambers_token";

type SessionUser = { id: number; email: string; full_name: string; role: string };
type Staff = SessionUser & {
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
};
type Role = { value: string; label: string; description: string };

async function api(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-LS", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function StaffManagementPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const counts = useMemo(() => ({
    total: staff.length,
    active: staff.filter((item) => item.is_active).length,
    inactive: staff.filter((item) => !item.is_active).length,
  }), [staff]);

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY) || "";
    if (!saved) return;
    setToken(saved);
    void bootstrap(saved);
  }, []);

  async function bootstrap(sessionToken: string) {
    setBusy(true);
    setError("");
    try {
      const me = await api("/api/v1/auth/me", sessionToken) as SessionUser;
      setUser(me);
      const [staffRows, roleRows] = await Promise.all([
        api("/api/v1/admin/staff", sessionToken),
        api("/api/v1/admin/staff/roles", sessionToken),
      ]);
      setStaff(staffRows);
      setRoles(roleRows);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Unable to load staff management";
      setError(text);
      if (/Authentication|required|expired|inactive/i.test(text)) {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken("");
        setUser(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!token) return;
    const rows = await api("/api/v1/admin/staff", token);
    setStaff(rows);
    if (selected) setSelected(rows.find((row: Staff) => row.id === selected.id) || null);
  }

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/v1/admin/staff", token, {
        method: "POST",
        body: JSON.stringify({
          full_name: data.get("full_name"),
          email: data.get("email"),
          role: data.get("role"),
          password: data.get("password"),
        }),
      });
      form.reset();
      setMessage("Staff account created. Give the temporary password to the staff member securely.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create staff account");
    } finally { setBusy(false); }
  }

  async function updateStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selected) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try {
      await api(`/api/v1/admin/staff/${selected.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: data.get("full_name"),
          role: data.get("role"),
          is_active: data.get("is_active") === "on",
        }),
      });
      setMessage("Staff account updated.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update staff account");
    } finally { setBusy(false); }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    try {
      await api(`/api/v1/admin/staff/${selected.id}/reset-password`, token, {
        method: "POST",
        body: JSON.stringify({ new_password: data.get("new_password") }),
      });
      form.reset();
      setMessage(`Temporary password reset for ${selected.full_name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password");
    } finally { setBusy(false); }
  }

  if (!token || !user) {
    return (
      <section className={styles.page}>
        <div className={styles.authCard}>
          <img src="/brand/lelefa-chambers-mark.svg" alt="Lelefa Chambers" />
          <span className={styles.eyebrow}>Secure staff area</span>
          <h1>Staff management</h1>
          <p>Sign in through the Chambers staff portal before managing staff accounts and access roles.</p>
          {error && <div className={styles.error}>{error}</div>}
          <Link className="button" href="/chambers-admin">Go to staff sign in →</Link>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>People & access control</span>
            <h1>Staff management</h1>
            <p>Create staff accounts, assign controlled roles, deactivate access and issue temporary password resets.</p>
          </div>
          <div className={styles.identity}>
            <span>Signed in as</span>
            <strong>{user.full_name}</strong>
            <small>{user.role.replaceAll("_", " ")}</small>
          </div>
        </header>

        <div className={styles.metrics}>
          <div><strong>{counts.total}</strong><span>Total staff</span></div>
          <div><strong>{counts.active}</strong><span>Active accounts</span></div>
          <div><strong>{counts.inactive}</strong><span>Inactive accounts</span></div>
        </div>

        {(message || error) && <div className={error ? styles.error : styles.notice}>{error || message}</div>}

        <div className={`${styles.workspace} ${busy ? styles.loading : ""}`}>
          <aside className={styles.panel}>
            <div className={styles.panelHead}>
              <div><span className={styles.eyebrow}>Directory</span><h2>Staff accounts</h2></div>
              <button type="button" className={styles.refresh} onClick={() => void refresh()} disabled={busy}>Refresh</button>
            </div>
            <div className={styles.staffList}>
              {staff.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`${styles.staffRow} ${selected?.id === item.id ? styles.selected : ""}`}
                  onClick={() => setSelected(item)}
                >
                  <span className={styles.avatar}>{item.full_name.split(/\s+/).map((part) => part[0]).join("").slice(0,2).toUpperCase()}</span>
                  <span className={styles.staffText}>
                    <strong>{item.full_name}</strong>
                    <small>{item.email}</small>
                    <span>{item.role.replaceAll("_", " ")}</span>
                  </span>
                  <i className={item.is_active ? styles.activeDot : styles.inactiveDot}>{item.is_active ? "Active" : "Inactive"}</i>
                </button>
              ))}
            </div>
          </aside>

          <div className={styles.stack}>
            <form className={styles.panel} onSubmit={createStaff}>
              <div className={styles.panelHead}><div><span className={styles.eyebrow}>New account</span><h2>Add staff member</h2></div></div>
              <div className={styles.formGrid}>
                <label><span>Full name</span><input name="full_name" minLength={2} required placeholder="Staff member name" /></label>
                <label><span>Email address</span><input name="email" type="email" required placeholder="name@lelefachambers.co.ls" /></label>
                <label><span>Access role</span><select name="role" required defaultValue=""><option value="" disabled>Select a role</option>{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
                <label><span>Temporary password</span><input name="password" type="password" minLength={12} required placeholder="Minimum 12 characters" autoComplete="new-password" /></label>
              </div>
              <button className="button" disabled={busy}>{busy ? "Working…" : "Create staff account"}</button>
              <p className={styles.hint}>Passwords are never displayed again. Share temporary passwords through a secure channel.</p>
            </form>

            {selected ? (
              <>
                <form className={styles.panel} onSubmit={updateStaff} key={`edit-${selected.id}`}>
                  <div className={styles.panelHead}><div><span className={styles.eyebrow}>Account controls</span><h2>Edit {selected.full_name}</h2></div><span className={styles.loginInfo}>Last login: {formatDate(selected.last_login_at)}</span></div>
                  <div className={styles.formGrid}>
                    <label><span>Full name</span><input name="full_name" defaultValue={selected.full_name} required /></label>
                    <label><span>Email address</span><input value={selected.email} disabled /></label>
                    <label><span>Access role</span><select name="role" defaultValue={selected.role}>{roles.some((role) => role.value === selected.role) ? null : <option value={selected.role}>{selected.role.replaceAll("_", " ")}</option>}{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
                    <label className={styles.toggle}><input type="checkbox" name="is_active" defaultChecked={selected.is_active} /><span>Account active</span></label>
                  </div>
                  <button className="button" disabled={busy}>Save account</button>
                </form>

                <form className={styles.panel} onSubmit={resetPassword} key={`password-${selected.id}`}>
                  <div className={styles.panelHead}><div><span className={styles.eyebrow}>Credential control</span><h2>Reset password</h2></div></div>
                  <div className={styles.passwordRow}>
                    <label><span>New temporary password</span><input name="new_password" type="password" minLength={12} required placeholder="Minimum 12 characters" autoComplete="new-password" /></label>
                    <button className={styles.dangerButton} disabled={busy}>Reset password</button>
                  </div>
                </form>
              </>
            ) : (
              <div className={styles.empty}><span>←</span><h2>Select a staff account</h2><p>Choose a staff member to change their role, access status or temporary password.</p></div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
