"use client";

import { FormEvent, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Json = Record<string, any>;

async function call(path: string, token?: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

export default function ClientPortalPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<Json | null>(null);
  const [dashboard, setDashboard] = useState<Json>({});
  const [matters, setMatters] = useState<Json[]>([]);
  const [selected, setSelected] = useState<Json | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("lelefa_client_portal_token");
    if (!saved) return;
    setToken(saved);
    call("/api/v1/client-portal/me", saved)
      .then((me) => {
        setUser(me);
        return load(saved);
      })
      .catch(() => {
        window.localStorage.removeItem("lelefa_client_portal_token");
        setToken("");
      });
  }, []);

  async function load(activeToken = token) {
    setBusy(true);
    try {
      const [summary, matterRows] = await Promise.all([
        call("/api/v1/client-portal/dashboard", activeToken),
        call("/api/v1/client-portal/matters", activeToken)
      ]);
      setDashboard(summary);
      setMatters(matterRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load portal data");
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await call("/api/v1/client-portal/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
      });
      window.localStorage.setItem("lelefa_client_portal_token", data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      await load(data.access_token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  async function openMatter(id: number) {
    setBusy(true); setMessage("");
    try {
      setSelected(await call(`/api/v1/client-portal/matters/${id}`, token));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open matter");
    } finally {
      setBusy(false);
    }
  }

  async function downloadDocument(id: number, name: string) {
    const response = await fetch(`${API}/api/v1/client-portal/documents/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      setMessage("Unable to download document");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; anchor.click();
    URL.revokeObjectURL(url);
  }

  function logout() {
    window.localStorage.removeItem("lelefa_client_portal_token");
    setToken(""); setUser(null); setDashboard({}); setMatters([]); setSelected(null);
  }

  if (!user) {
    return (
      <section className="section section-cream" style={{minHeight:"75vh"}}>
        <div className="shell">
          <form className={`login-card ${busy ? "loading" : ""}`} onSubmit={login}>
            <div className="eyebrow">Institutional Client Portal</div>
            <h1>Secure matter visibility</h1>
            <p className="muted">For authorised Lelefa Chambers institutional clients. Access is issued by the Chambers and is restricted to your organisation's matters.</p>
            <div className="field"><label>Email</label><input name="email" type="email" required /></div>
            <div className="field" style={{marginTop:14}}><label>Password</label><input name="password" type="password" required /></div>
            {message && <p className="notice error">{message}</p>}
            <button className="button" style={{width:"100%",marginTop:18}} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="section section-cream" style={{minHeight:"80vh"}}>
      <div className="shell">
        <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"center",marginBottom:28}}>
          <div>
            <div className="eyebrow">Institutional Client Portal</div>
            <h1 style={{fontFamily:"Georgia,serif",fontSize:"2.6rem",margin:"6px 0"}}>{user.client_name || "Client workspace"}</h1>
            <p className="muted" style={{margin:0}}>{user.full_name} • {user.role}</p>
          </div>
          <button className="button button-small" onClick={logout}>Sign out</button>
        </div>

        {message && <p className="notice error">{message}</p>}

        <div className="metrics" style={{marginBottom:28}}>
          <Metric label="Open matters" value={dashboard.open_matters ?? 0} />
          <Metric label="Active settlements" value={dashboard.settlements ?? 0} />
          <Metric label="Unsatisfied judgments" value={dashboard.judgments ?? 0} />
          <Metric label="Execution actions" value={dashboard.execution_actions ?? 0} />
        </div>
        <div className="content-card" style={{marginBottom:28}}>
          <div className="eyebrow">Recorded recovery</div>
          <h2 style={{fontSize:"2.2rem"}}>M {Number(dashboard.recovered_total || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</h2>
          <p className="muted">Matched recovery payments recorded against your Chambers matters. Contractual balances remain subject to the creditor/source system of record.</p>
        </div>

        <div className="content-grid">
          <div className="content-card">
            <div className="eyebrow">Matters</div>
            <h2 style={{fontSize:"2rem"}}>Your legal matters</h2>
            <div className="admin-list">
              {matters.map((matter) => (
                <button className="admin-row" style={{background:"white",textAlign:"left",cursor:"pointer"}} key={matter.id} onClick={() => openMatter(matter.id)}>
                  <span><strong>{matter.matter_reference}</strong><br/><small>{matter.title}</small><br/><small className="muted">{matter.stage} • {matter.status}</small></span>
                  <span>→</span>
                </button>
              ))}
              {!matters.length && <p className="muted">No matters are currently visible for this account.</p>}
            </div>
          </div>

          <aside className="content-card">
            {!selected ? (
              <><div className="eyebrow">Matter detail</div><h2 style={{fontSize:"2rem"}}>Select a matter</h2><p className="muted">Open a matter to view its current stage, client-visible documents, settlements, judgments, execution activity and matched recovery payments.</p></>
            ) : (
              <MatterDetail data={selected} onDownload={downloadDocument} />
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function MatterDetail({ data, onDownload }: { data: Json; onDownload:(id:number,name:string)=>void }) {
  const matter = data.matter || {};
  return (
    <>
      <div className="eyebrow">{matter.matter_reference}</div>
      <h2 style={{fontSize:"2rem"}}>{matter.title}</h2>
      <p><strong>Stage:</strong> {matter.stage}<br/><strong>Status:</strong> {matter.status}<br/><strong>Court:</strong> {matter.court_name || "—"}<br/><strong>Case no.:</strong> {matter.court_case_number || "—"}</p>
      <p><strong>Recorded recovery:</strong> M {Number(matter.recovery_amount || 0).toLocaleString(undefined,{minimumFractionDigits:2})}</p>

      <Section title="Client-visible documents">
        {(data.documents || []).map((doc:Json) => <button key={doc.id} className="admin-row" style={{width:"100%",background:"white",cursor:"pointer"}} onClick={() => onDownload(doc.id, doc.original_name)}><span>{doc.title}<br/><small className="muted">{doc.category}</small></span><span>Download</span></button>)}
        {!data.documents?.length && <p className="muted">No client-visible documents.</p>}
      </Section>
      <Section title="Settlements">{(data.settlements || []).map((row:Json) => <Record key={row.id} title={row.settlement_reference} body={`M ${Number(row.agreed_amount).toLocaleString()} • ${row.status}`} />)}</Section>
      <Section title="Judgments">{(data.judgments || []).map((row:Json) => <Record key={row.id} title={row.judgment_reference} body={`M ${Number(row.total_awarded).toLocaleString()} • ${row.status}`} />)}</Section>
      <Section title="Execution">{(data.executions || []).map((row:Json) => <Record key={row.id} title={row.action_type.replaceAll("_"," ")} body={row.status} />)}</Section>
      <Section title="Matched payments">{(data.payments || []).map((row:Json) => <Record key={row.id} title={`M ${Number(row.amount).toLocaleString()}`} body={`${row.payment_reference} • ${new Date(row.received_at).toLocaleDateString()}`} />)}</Section>
    </>
  );
}

function Section({title,children}:{title:string;children:React.ReactNode}) { return <div style={{marginTop:28}}><h3 style={{fontFamily:"Georgia,serif",fontSize:"1.2rem"}}>{title}</h3><div className="admin-list">{children}</div></div>; }
function Record({title,body}:{title:string;body:string}) { return <div className="admin-row"><span><strong>{title}</strong><br/><small className="muted">{body}</small></span></div>; }
