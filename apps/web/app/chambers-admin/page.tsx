"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type AnyRow = Record<string, any>;
type Tab = "dashboard" | "pages" | "practice" | "professionals" | "articles" | "consultations" | "audit";

async function api(path: string, token?: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

export default function ChambersAdminPage() {
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<AnyRow | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<AnyRow>({});
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [selected, setSelected] = useState<AnyRow | null>(null);
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("lelefa_chambers_token");
    if (saved) {
      setToken(saved);
      api("/api/v1/auth/me", saved).then(setUser).catch(() => window.localStorage.removeItem("lelefa_chambers_token"));
    }
  }, []);

  useEffect(() => {
    if (!token || !user) return;
    loadTab(tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token, user]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await api("/api/v1/auth/login", undefined, { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
      window.localStorage.setItem("lelefa_chambers_token", data.access_token);
      setToken(data.access_token); setUser(data.user); setMessage("Signed in.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to sign in"); }
    finally { setBusy(false); }
  }

  function logout() {
    window.localStorage.removeItem("lelefa_chambers_token");
    setToken(""); setUser(null); setRows([]); setSelected(null); setMessage("");
  }

  async function loadTab(next: Tab) {
    setBusy(true); setMessage(""); setSelected(null);
    try {
      if (next === "dashboard") setDashboard(await api("/api/v1/admin/dashboard", token));
      else {
        const path: Record<Exclude<Tab,"dashboard">, string> = {
          pages: "/api/v1/admin/pages",
          practice: "/api/v1/admin/practice-areas",
          professionals: "/api/v1/admin/professionals",
          articles: "/api/v1/admin/articles",
          consultations: "/api/v1/admin/consultations",
          audit: "/api/v1/admin/audit"
        };
        setRows(await api(path[next], token));
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load data"); }
    finally { setBusy(false); }
  }

  async function saveEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    try {
      if (tab === "pages") {
        const payload = {
          slug: form.get("slug"), title: form.get("title"), nav_label: form.get("nav_label") || null,
          hero_title: form.get("hero_title") || null, hero_body: form.get("hero_body") || null,
          excerpt: form.get("excerpt") || null, sections: selected.sections || [],
          seo_title: form.get("seo_title") || null, seo_description: form.get("seo_description") || null,
          status: form.get("status"), sort_order: Number(form.get("sort_order") || 0), show_in_navigation: form.get("show_in_navigation") === "on"
        };
        await api(`/api/v1/admin/pages/${selected.id}`, token, { method: "PUT", body: JSON.stringify(payload) });
      }
      if (tab === "practice") {
        const payload = {
          slug: form.get("slug"), name: form.get("name"), short_description: form.get("short_description"), body: form.get("body") || "",
          icon: null, audience: String(form.get("audience") || "").split(",").map(v => v.trim()).filter(Boolean),
          featured: form.get("featured") === "on", sort_order: Number(form.get("sort_order") || 0), status: form.get("status"),
          seo_title: form.get("seo_title") || null, seo_description: form.get("seo_description") || null
        };
        await api(`/api/v1/admin/practice-areas/${selected.id}`, token, { method: "PUT", body: JSON.stringify(payload) });
      }
      if (tab === "professionals") {
        const payload = {
          slug: form.get("slug"), full_name: form.get("full_name"), title: form.get("title"), role: form.get("role") || null,
          biography: form.get("biography") || "", qualifications: String(form.get("qualifications") || "").split(",").map(v => v.trim()).filter(Boolean),
          practice_areas: String(form.get("practice_areas") || "").split(",").map(v => v.trim()).filter(Boolean), admission_date: form.get("admission_date") || null,
          image_url: form.get("image_url") || null, email: form.get("email") || null, featured: form.get("featured") === "on",
          sort_order: Number(form.get("sort_order") || 0), status: form.get("status")
        };
        await api(`/api/v1/admin/professionals/${selected.id}`, token, { method: "PUT", body: JSON.stringify(payload) });
      }
      if (tab === "articles") {
        const payload = {
          slug: form.get("slug"), title: form.get("title"), excerpt: form.get("excerpt") || "", body: form.get("body") || "",
          category: form.get("category") || "Legal Insight", author_name: form.get("author_name") || null, image_url: form.get("image_url") || null,
          status: form.get("status"), seo_title: form.get("seo_title") || null, seo_description: form.get("seo_description") || null
        };
        await api(`/api/v1/admin/articles/${selected.id}`, token, { method: "PUT", body: JSON.stringify(payload) });
      }
      setMessage("Changes saved and audit history updated.");
      await loadTab(tab);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save"); }
    finally { setBusy(false); }
  }

  async function updateConsultation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api(`/api/v1/admin/consultations/${selected.id}`, token, { method: "PATCH", body: JSON.stringify({ status: form.get("status"), assigned_to: form.get("assigned_to") || null, internal_note: form.get("internal_note") || null }) });
      setMessage("Consultation updated."); await loadTab("consultations");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save"); }
    finally { setBusy(false); }
  }

  if (!user) return (
    <div className="admin-shell">
      <form className={`login-card ${busy ? "loading" : ""}`} onSubmit={login}>
        <div className="eyebrow">Lelefa Chambers CMS</div>
        <h1>Administration</h1>
        <p className="muted">Manage the public website, legal profiles, insights and consultation requests.</p>
        <div className="field"><label>Email</label><input name="email" type="email" required /></div>
        <div className="field" style={{marginTop:14}}><label>Password</label><input name="password" type="password" minLength={8} required /></div>
        {message && <p className="notice error">{message}</p>}
        <button className="button" style={{marginTop:18,width:"100%"}} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );

  return (
    <div className="admin-shell">
      <div className="admin-card">
        <header className="admin-head">
          <div><strong>Lelefa Chambers CMS</strong><div style={{fontSize:12,opacity:.75}}>{user.full_name} • {user.role}</div></div>
          <button className="button button-light button-small" onClick={logout}>Sign out</button>
        </header>
        <div className={`admin-body ${busy ? "loading" : ""}`}>
          <div className="admin-tabs">
            {(["dashboard","pages","practice","professionals","articles","consultations","audit"] as Tab[]).map((item) => (
              <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item.replace("practice","practice areas")}</button>
            ))}
          </div>
          {message && <p className="notice">{message}</p>}
          {tab === "dashboard" ? <Dashboard data={dashboard} /> : (
            <div className="content-grid">
              <EntityList tab={tab} rows={rows} onSelect={setSelected} />
              <Editor tab={tab} item={selected} onSave={tab === "consultations" ? updateConsultation : saveEntity} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Dashboard({ data }: { data: AnyRow }) {
  const metrics = [
    ["Pages", data.pages], ["Practice areas", data.practice_areas], ["Professionals", data.professionals],
    ["Articles", data.articles], ["New consultations", data.new_consultations], ["Media", data.media_assets]
  ];
  return <div><div className="eyebrow">Content operations</div><h2 style={{fontFamily:"Georgia,serif",fontSize:"2.3rem"}}>Website & Chambers dashboard</h2><div className="admin-grid">{metrics.map(([label,value]) => <div className="admin-stat" key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div><p className="notice" style={{marginTop:24}}>Public content is stored in PostgreSQL. Draft/review/publish state and API permissions enforce controlled publishing; changes are recorded in the audit log.</p></div>;
}

function EntityList({ tab, rows, onSelect }: { tab: Tab; rows: AnyRow[]; onSelect: (row:AnyRow)=>void }) {
  if (!rows.length) return <div className="content-card"><p>No records yet.</p></div>;
  return <div className="admin-list">{rows.map((row) => {
    const title = row.title || row.name || row.full_name || row.email || `${row.entity_type || tab} #${row.id}`;
    const sub = row.status || row.action || row.category || row.matter_type || "";
    return <button type="button" className="admin-row" key={row.id} onClick={() => onSelect(row)} style={{textAlign:"left",background:"white",cursor:"pointer"}}><span><strong>{title}</strong><br/><small className="muted">{sub}</small></span><span>→</span></button>;
  })}</div>;
}

function Editor({ tab, item, onSave }: { tab: Tab; item: AnyRow | null; onSave:(e:FormEvent<HTMLFormElement>)=>void }) {
  if (!item) return <aside className="content-card"><div className="eyebrow">Editor</div><h2 style={{fontSize:"2rem"}}>Select a record</h2><p className="muted">Choose an item from the list to review or edit it.</p></aside>;
  if (tab === "audit") return <aside className="content-card"><div className="eyebrow">Audit event</div><h2 style={{fontSize:"1.8rem"}}>{item.action}</h2><pre style={{whiteSpace:"pre-wrap",fontSize:12}}>{JSON.stringify(item,null,2)}</pre></aside>;
  if (tab === "consultations") return <form className="content-card" onSubmit={onSave}><div className="eyebrow">Consultation #{item.id}</div><h2 style={{fontSize:"1.8rem"}}>{item.full_name}</h2><p>{item.email}<br/>{item.phone}<br/><strong>{item.matter_type}</strong></p><p className="notice">{item.summary}</p><Field label="Status"><select name="status" defaultValue={item.status}><option>new</option><option>reviewing</option><option>conflict_check</option><option>scheduled</option><option>closed</option><option>declined</option></select></Field><Field label="Assigned to"><input name="assigned_to" defaultValue={item.assigned_to || ""}/></Field><Field label="Internal note"><textarea name="internal_note" rows={5} defaultValue={item.internal_note || ""}/></Field><button className="button">Save consultation</button></form>;
  return <form className="content-card" onSubmit={onSave} key={`${tab}-${item.id}`}><div className="eyebrow">Edit {tab}</div>{tab === "pages" && <PageFields item={item}/>} {tab === "practice" && <PracticeFields item={item}/>} {tab === "professionals" && <ProfessionalFields item={item}/>} {tab === "articles" && <ArticleFields item={item}/>}<button className="button" type="submit">Save changes</button></form>;
}

function Field({label,children}:{label:string;children:React.ReactNode}) { return <div className="field" style={{marginBottom:13}}><label>{label}</label>{children}</div>; }
function Status({value}:{value:string}) { return <Field label="Status"><select name="status" defaultValue={value}><option value="draft">Draft</option><option value="review">Review</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>; }
function PageFields({item}:{item:AnyRow}) { return <><Field label="Slug"><input name="slug" defaultValue={item.slug}/></Field><Field label="Title"><input name="title" defaultValue={item.title}/></Field><Field label="Navigation label"><input name="nav_label" defaultValue={item.nav_label || ""}/></Field><Field label="Hero title"><input name="hero_title" defaultValue={item.hero_title || ""}/></Field><Field label="Hero body"><textarea name="hero_body" rows={5} defaultValue={item.hero_body || ""}/></Field><Field label="Excerpt"><textarea name="excerpt" rows={4} defaultValue={item.excerpt || ""}/></Field><Field label="SEO title"><input name="seo_title" defaultValue={item.seo_title || ""}/></Field><Field label="SEO description"><textarea name="seo_description" rows={3} defaultValue={item.seo_description || ""}/></Field><Field label="Sort order"><input name="sort_order" type="number" defaultValue={item.sort_order || 0}/></Field><label style={{display:"flex",gap:8,marginBottom:14}}><input type="checkbox" name="show_in_navigation" defaultChecked={item.show_in_navigation}/> Show in navigation</label><Status value={item.status}/></>; }
function PracticeFields({item}:{item:AnyRow}) { return <><Field label="Slug"><input name="slug" defaultValue={item.slug}/></Field><Field label="Name"><input name="name" defaultValue={item.name}/></Field><Field label="Short description"><textarea name="short_description" rows={4} defaultValue={item.short_description}/></Field><Field label="Full description"><textarea name="body" rows={7} defaultValue={item.body || ""}/></Field><Field label="Audience (comma separated)"><input name="audience" defaultValue={(item.audience || []).join(", ")}/></Field><Field label="Sort order"><input name="sort_order" type="number" defaultValue={item.sort_order || 0}/></Field><label style={{display:"flex",gap:8,marginBottom:14}}><input type="checkbox" name="featured" defaultChecked={item.featured}/> Featured</label><Field label="SEO title"><input name="seo_title" defaultValue={item.seo_title || ""}/></Field><Field label="SEO description"><textarea name="seo_description" rows={3} defaultValue={item.seo_description || ""}/></Field><Status value={item.status}/></>; }
function ProfessionalFields({item}:{item:AnyRow}) { return <><Field label="Slug"><input name="slug" defaultValue={item.slug}/></Field><Field label="Full name"><input name="full_name" defaultValue={item.full_name}/></Field><Field label="Professional title"><input name="title" defaultValue={item.title}/></Field><Field label="Role / Chambers"><input name="role" defaultValue={item.role || ""}/></Field><Field label="Biography"><textarea name="biography" rows={8} defaultValue={item.biography || ""}/></Field><Field label="Qualifications (comma separated)"><input name="qualifications" defaultValue={(item.qualifications || []).join(", ")}/></Field><Field label="Practice areas (comma separated)"><input name="practice_areas" defaultValue={(item.practice_areas || []).join(", ")}/></Field><Field label="Admission date"><input name="admission_date" defaultValue={item.admission_date || ""}/></Field><Field label="Image URL"><input name="image_url" defaultValue={item.image_url || ""}/></Field><Field label="Email"><input name="email" type="email" defaultValue={item.email || ""}/></Field><Field label="Sort order"><input name="sort_order" type="number" defaultValue={item.sort_order || 0}/></Field><label style={{display:"flex",gap:8,marginBottom:14}}><input type="checkbox" name="featured" defaultChecked={item.featured}/> Featured</label><Status value={item.status}/></>; }
function ArticleFields({item}:{item:AnyRow}) { return <><Field label="Slug"><input name="slug" defaultValue={item.slug}/></Field><Field label="Title"><input name="title" defaultValue={item.title}/></Field><Field label="Category"><input name="category" defaultValue={item.category || "Legal Insight"}/></Field><Field label="Author"><input name="author_name" defaultValue={item.author_name || ""}/></Field><Field label="Excerpt"><textarea name="excerpt" rows={4} defaultValue={item.excerpt || ""}/></Field><Field label="Body"><textarea name="body" rows={12} defaultValue={item.body || ""}/></Field><Field label="Image URL"><input name="image_url" defaultValue={item.image_url || ""}/></Field><Field label="SEO title"><input name="seo_title" defaultValue={item.seo_title || ""}/></Field><Field label="SEO description"><textarea name="seo_description" rows={3} defaultValue={item.seo_description || ""}/></Field><Status value={item.status}/></>; }
