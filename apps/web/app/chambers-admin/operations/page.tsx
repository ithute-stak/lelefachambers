"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./operations.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Row = Record<string, any>;
type Tab = "dashboard" | "matters" | "clients" | "conflicts" | "court" | "tasks" | "referrals" | "credentials" | "users" | "media";

async function request(path: string, token?: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

function isoLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function money(value?: string | number | null) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-LS", { style: "currency", currency: "LSL", maximumFractionDigits: 2 }).format(amount);
}

function prettyDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-LS", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function OperationsPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<Row | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<Row>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [clients, setClients] = useState<Row[]>([]);
  const [matters, setMatters] = useState<Row[]>([]);
  const [professionals, setProfessionals] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{kind:"success"|"error"; text:string} | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("lelefa_chambers_token") || "";
    if (!saved) return;
    setToken(saved);
    request("/api/v1/auth/me", saved).then(setUser).catch(() => window.localStorage.removeItem("lelefa_chambers_token"));
  }, []);

  useEffect(() => {
    if (!token || !user) return;
    loadTab(tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token, user]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const data = await request("/api/v1/auth/login", undefined, { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
      window.localStorage.setItem("lelefa_chambers_token", data.access_token);
      setToken(data.access_token); setUser(data.user);
    } catch (error) { setMessage({kind:"error", text:error instanceof Error ? error.message : "Unable to sign in"}); }
    finally { setBusy(false); }
  }

  function logout() {
    window.localStorage.removeItem("lelefa_chambers_token");
    setToken(""); setUser(null); setRows([]); setSelected(null);
  }

  async function loadSupport() {
    const [clientRows, matterRows, professionalRows] = await Promise.all([
      request("/api/v1/ops/clients", token).catch(() => []),
      request("/api/v1/ops/matters", token).catch(() => []),
      request("/api/v1/admin/professionals", token).catch(() => [])
    ]);
    setClients(clientRows); setMatters(matterRows); setProfessionals(professionalRows);
  }

  async function loadTab(next: Tab) {
    setBusy(true); setMessage(null); setSelected(null); setNewMode(false); setQuery("");
    try {
      if (next === "dashboard") {
        setDashboard(await request("/api/v1/ops/dashboard", token));
        setRows([]);
      } else {
        const paths: Record<Exclude<Tab,"dashboard">, string> = {
          matters: "/api/v1/ops/matters",
          clients: "/api/v1/ops/clients",
          conflicts: "/api/v1/ops/conflict-checks",
          court: "/api/v1/ops/court-events",
          tasks: "/api/v1/ops/tasks",
          referrals: "/api/v1/ops/recovery-referrals",
          credentials: "/api/v1/ops/credentials",
          users: "/api/v1/ops/users",
          media: "/api/v1/ops/media"
        };
        setRows(await request(paths[next], token));
        if (["matters","court","tasks","credentials"].includes(next)) await loadSupport();
      }
    } catch (error) {
      setMessage({kind:"error", text:error instanceof Error ? error.message : "Unable to load workspace"});
    } finally { setBusy(false); }
  }

  async function refresh() { await loadTab(tab); }

  async function selectRow(row: Row) {
    setNewMode(false); setMessage(null);
    if (tab === "matters") {
      setBusy(true);
      try { setSelected(await request(`/api/v1/ops/matters/${row.id}`, token)); }
      catch (error) { setMessage({kind:"error", text:error instanceof Error ? error.message : "Unable to open matter"}); }
      finally { setBusy(false); }
    } else setSelected(row);
  }

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [rows, query]);

  async function mutate(path: string, method: string, payload?: any, success = "Saved successfully") {
    setBusy(true); setMessage(null);
    try {
      const data = await request(path, token, { method, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) });
      setMessage({kind:"success", text:success});
      await loadTab(tab);
      return data;
    } catch (error) {
      setMessage({kind:"error", text:error instanceof Error ? error.message : "Operation failed"});
      return null;
    } finally { setBusy(false); }
  }

  if (!user) return (
    <div className={styles.page}>
      <form className={`${styles.login} ${busy ? styles.spinner : ""}`} onSubmit={login}>
        <div className={styles.sectionLabel}>Lelefa Chambers</div>
        <h1>Legal Operations</h1>
        <p>Matters, conflict checks, court diary, tasks, credentials and controlled recovery referrals.</p>
        <Field label="Email"><input name="email" type="email" required /></Field>
        <Field label="Password"><input name="password" type="password" minLength={8} required /></Field>
        {message && <div className={`${styles.notice} ${styles.error}`}>{message.text}</div>}
        <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div><h1>Lelefa Chambers Legal Operations</h1><p>{user.full_name} • {user.role}</p></div>
          <div className={styles.headerActions}>
            <Link className={styles.linkButton} href="/chambers-admin">Website CMS</Link>
            <Link className={styles.ghostButton} href="/">Public site</Link>
            <button className={styles.ghostButton} onClick={logout}>Sign out</button>
          </div>
        </header>
        <div className={`${styles.body} ${busy ? styles.spinner : ""}`}>
          <nav className={styles.tabs}>
            {(["dashboard","matters","clients","conflicts","court","tasks","referrals","credentials","users","media"] as Tab[]).map((item) => (
              <button key={item} className={`${styles.tab} ${tab === item ? styles.activeTab : ""}`} onClick={() => setTab(item)}>{tabLabel(item)}</button>
            ))}
          </nav>
          {message && <div className={`${styles.notice} ${message.kind === "error" ? styles.error : styles.success}`}>{message.text}</div>}
          {tab === "dashboard" ? <Dashboard data={dashboard} /> : (
            <div className={styles.workspace}>
              <section className={styles.panel}>
                <div className={styles.toolbar}>
                  <input className={styles.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${tabLabel(tab).toLowerCase()}…`} />
                  {canCreate(tab, user.role) && <button className={styles.primaryButton} onClick={() => {setSelected(null);setNewMode(true);}}>+ New</button>}
                  <button className={styles.ghostButton} style={{color:"#64152a",borderColor:"#d9cbbb"}} onClick={refresh}>Refresh</button>
                </div>
                <RecordList tab={tab} rows={filteredRows} selected={selected} onSelect={selectRow} />
              </section>
              <section className={styles.panel}>
                <Editor tab={tab} item={selected} newMode={newMode} clients={clients} matters={matters} professionals={professionals} user={user} token={token} mutate={mutate} setMessage={setMessage} refresh={refresh} onSelect={setSelected} />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function tabLabel(tab: Tab) {
  const labels: Record<Tab,string> = {dashboard:"Dashboard",matters:"Matters",clients:"Clients",conflicts:"Conflict Checks",court:"Court Diary",tasks:"Tasks",referrals:"Recovery Referrals",credentials:"Credentials",users:"Users",media:"Media"};
  return labels[tab];
}

function canCreate(tab: Tab, role: string) {
  if (["dashboard","referrals","media"].includes(tab)) return false;
  if (tab === "users") return role === "system_owner";
  return !["auditor"].includes(role);
}

function Dashboard({data}:{data:Row}) {
  const metrics = [
    ["Open matters",data.open_matters],["Active clients",data.active_clients],["Court events",data.upcoming_court_events],
    ["Overdue tasks",data.overdue_tasks],["Conflict reviews",data.pending_conflicts],["Pending referrals",data.pending_referrals]
  ];
  return <>
    <div className={styles.metrics}>{metrics.map(([label,value]) => <div className={styles.metric} key={String(label)}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div>
    <div className={styles.dashboardGrid}>
      <section className={styles.panel}><div className={styles.panelTitle}><h2>Upcoming court events</h2><span className={styles.badge}>Diary</span></div><div className={styles.timeline}>{(data.upcoming || []).length ? data.upcoming.map((row:Row) => <div className={styles.timelineItem} key={row.id}><strong>{row.event_type}</strong><small>{prettyDate(row.scheduled_at)} • {row.court_name || "Court/location pending"}</small></div>) : <Empty text="No scheduled court events." />}</div></section>
      <section className={styles.panel}><div className={styles.panelTitle}><h2>Overdue tasks</h2><span className={`${styles.badge} ${styles.high}`}>Needs action</span></div><div className={styles.timeline}>{(data.overdue || []).length ? data.overdue.map((row:Row) => <div className={styles.timelineItem} key={row.id}><strong>{row.title}</strong><small>{row.assigned_to || "Unassigned"} • due {prettyDate(row.due_at)}</small></div>) : <Empty text="No overdue legal tasks." />}</div></section>
    </div>
    <div className={styles.panel} style={{marginTop:18}}><div className={styles.panelTitle}><h2>Recorded recoveries</h2><strong style={{fontFamily:"Georgia,serif",fontSize:"1.7rem",color:"#7b1830"}}>{money(data.recovery_total)}</strong></div><p className={styles.small}>This is the amount recorded against Chambers matters. It is an operational ledger value, not a client bank balance. Creditor/source-system balances remain authoritative unless contractually agreed otherwise.</p></div>
  </>;
}

function RecordList({tab,rows,selected,onSelect}:{tab:Tab;rows:Row[];selected:Row|null;onSelect:(row:Row)=>void}) {
  if (!rows.length) return <Empty text={`No ${tabLabel(tab).toLowerCase()} found.`}/>;
  return <div className={styles.list}>{rows.map((row) => {
    const [title,meta] = recordLabel(tab,row);
    return <button className={`${styles.row} ${selected?.id === row.id ? styles.selected : ""}`} key={row.id} onClick={() => onSelect(row)}>
      <span><span className={styles.rowTitle}>{title}</span><span className={styles.rowMeta}>{meta}</span></span>
      <Badge value={row.status || row.stage || row.role || row.action || row.content_type || "record"} priority={row.priority}/>
    </button>;
  })}</div>;
}

function recordLabel(tab:Tab,row:Row):[string,string] {
  if (tab === "matters") return [row.matter_reference || row.title, `${row.title} • ${row.client_name || "Client"}`];
  if (tab === "clients") return [row.name, `${row.client_code} • ${row.client_type}`];
  if (tab === "conflicts") return [row.subject_name, `${row.requested_for || "General check"} • ${(row.hits || []).length} hit(s)`];
  if (tab === "court") return [row.event_type, `${row.matter_reference || "Matter"} • ${prettyDate(row.scheduled_at)}`];
  if (tab === "tasks") return [row.title, `${row.matter_reference || "Matter"} • ${row.assigned_to || "Unassigned"}`];
  if (tab === "referrals") return [row.external_reference, `${row.creditor_name} • ${row.debtor_reference} • ${money(row.outstanding_balance)}`];
  if (tab === "credentials") return [row.credential_type, `${row.professional_name || "Professional"} • expires ${row.expiry_date || "not set"}`];
  if (tab === "users") return [row.full_name, `${row.email} • ${row.role}`];
  if (tab === "media") return [row.original_name, `${row.content_type} • ${Math.round((row.size_bytes || 0)/1024)} KB`];
  return [`#${row.id}`,""];
}

function Badge({value,priority}:{value:string;priority?:string}) {
  const normalized = String(priority || value || "").toLowerCase();
  const tone = normalized.includes("urgent") || normalized.includes("conflict_confirmed") ? styles.urgent : normalized.includes("high") || normalized.includes("potential") || normalized.includes("overdue") ? styles.high : normalized.includes("clear") || normalized.includes("active") || normalized.includes("completed") || normalized.includes("accepted") ? styles.green : normalized.includes("pending") || normalized.includes("scheduled") || normalized.includes("review") ? styles.amber : "";
  return <span className={`${styles.badge} ${tone}`}>{priority || value}</span>;
}

function Editor({tab,item,newMode,clients,matters,professionals,user,token,mutate,setMessage,refresh,onSelect}:{tab:Tab;item:Row|null;newMode:boolean;clients:Row[];matters:Row[];professionals:Row[];user:Row;token:string;mutate:(path:string,method:string,payload?:any,success?:string)=>Promise<any>;setMessage:(v:any)=>void;refresh:()=>Promise<void>;onSelect:(r:Row|null)=>void}) {
  if (tab === "clients") return <ClientEditor item={item} newMode={newMode} mutate={mutate}/>;
  if (tab === "matters") return <MatterEditor item={item} newMode={newMode} clients={clients} mutate={mutate}/>;
  if (tab === "conflicts") return <ConflictEditor item={item} newMode={newMode} mutate={mutate}/>;
  if (tab === "court") return <CourtEditor item={item} newMode={newMode} matters={matters} mutate={mutate}/>;
  if (tab === "tasks") return <TaskEditor item={item} newMode={newMode} matters={matters} mutate={mutate}/>;
  if (tab === "referrals") return <ReferralEditor item={item} mutate={mutate}/>;
  if (tab === "credentials") return <CredentialEditor item={item} newMode={newMode} professionals={professionals} mutate={mutate}/>;
  if (tab === "users") return <UserEditor item={item} newMode={newMode} currentUser={user} mutate={mutate}/>;
  if (tab === "media") return <MediaEditor item={item} token={token} setMessage={setMessage} refresh={refresh}/>;
  return <Empty text="Select a record to view details."/>;
}

function ClientEditor({item,newMode,mutate}:{item:Row|null;newMode:boolean;mutate:any}) {
  if (!item && !newMode) return <Empty text="Select a client or create a new one."/>;
  return <form className={styles.form} onSubmit={(e) => {e.preventDefault();const f=new FormData(e.currentTarget);const payload=Object.fromEntries(f.entries());mutate(item?`/api/v1/ops/clients/${item.id}`:"/api/v1/ops/clients",item?"PATCH":"POST",payload,item?"Client updated":"Client created");}}>
    <div className={styles.sectionLabel}>{item ? item.client_code : "New client"}</div><h2>{item?.name || "Create client"}</h2>
    <div className={styles.grid2}><Field label="Client name"><input name="name" required defaultValue={item?.name || ""}/></Field><Field label="Type"><select name="client_type" defaultValue={item?.client_type || "institutional"}>{["institutional","bank","mfi","sacco","corporate","government","individual"].map(v=><option key={v}>{v}</option>)}</select></Field></div>
    <div className={styles.grid2}><Field label="Registration number"><input name="registration_number" defaultValue={item?.registration_number || ""}/></Field><Field label="Tax number"><input name="tax_number" defaultValue={item?.tax_number || ""}/></Field></div>
    <div className={styles.grid2}><Field label="Contact person"><input name="contact_name" defaultValue={item?.contact_name || ""}/></Field><Field label="Email"><input name="email" type="email" defaultValue={item?.email || ""}/></Field></div>
    <div className={styles.grid2}><Field label="Phone"><input name="phone" defaultValue={item?.phone || ""}/></Field><Field label="Status"><select name="status" defaultValue={item?.status || "active"}><option>active</option><option>prospective</option><option>inactive</option></select></Field></div>
    <Field label="Address"><textarea name="address" rows={3} defaultValue={item?.address || ""}/></Field><Field label="Notes"><textarea name="notes" rows={4} defaultValue={item?.notes || ""}/></Field>
    <div className={styles.actions}><button className={styles.primaryButton}>{item?"Save client":"Create client"}</button></div>
  </form>;
}

function MatterEditor({item,newMode,clients,mutate}:{item:Row|null;newMode:boolean;clients:Row[];mutate:any}) {
  if (!item && !newMode) return <Empty text="Select a legal matter or create a new one."/>;
  const submit = (e:FormEvent<HTMLFormElement>) => {e.preventDefault();const f=new FormData(e.currentTarget);const payload:any=Object.fromEntries(f.entries());if(!item)payload.client_id=Number(payload.client_id);if(payload.next_deadline==="")payload.next_deadline=null;if(payload.recovery_amount!==undefined)payload.recovery_amount=Number(payload.recovery_amount||0);if(payload.legal_costs!==undefined)payload.legal_costs=Number(payload.legal_costs||0);mutate(item?`/api/v1/ops/matters/${item.id}`:"/api/v1/ops/matters",item?"PATCH":"POST",payload,item?"Matter updated":"Matter created");};
  return <>
    <form className={styles.form} onSubmit={submit}><div className={styles.sectionLabel}>{item?.matter_reference || "New matter"}</div><h2>{item?.title || "Create legal matter"}</h2>
      {!item && <Field label="Client"><select name="client_id" required defaultValue=""><option value="" disabled>Select client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.client_code} — {c.name}</option>)}</select></Field>}
      <div className={styles.grid2}><Field label="Client reference"><input name="client_reference" defaultValue={item?.client_reference || ""}/></Field><Field label="Matter type"><select name="matter_type" defaultValue={item?.matter_type || "commercial_litigation"}>{["debt_recovery","commercial_litigation","civil_litigation","corporate","compliance","mediation","employment","other"].map(v=><option key={v}>{v}</option>)}</select></Field></div>
      <Field label="Title"><input name="title" required defaultValue={item?.title || ""}/></Field>
      <div className={styles.grid2}><Field label="Stage"><input name="stage" defaultValue={item?.stage || "instruction"}/></Field><Field label="Priority"><select name="priority" defaultValue={item?.priority || "normal"}><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></Field></div>
      <div className={styles.grid2}><Field label="Status"><select name="status" defaultValue={item?.status || "open"}><option>open</option><option>on_hold</option><option>closed</option></select></Field><Field label="Lead professional"><input name="lead_professional" defaultValue={item?.lead_professional || ""}/></Field></div>
      <div className={styles.grid2}><Field label="Court"><input name="court_name" defaultValue={item?.court_name || ""}/></Field><Field label="Court case number"><input name="court_case_number" defaultValue={item?.court_case_number || ""}/></Field></div>
      <Field label="Next deadline"><input name="next_deadline" type="datetime-local" defaultValue={isoLocal(item?.next_deadline)}/></Field><Field label="Description"><textarea name="description" rows={4} defaultValue={item?.description || ""}/></Field>
      {item && <div className={styles.grid2}><Field label="Recovery recorded"><input name="recovery_amount" type="number" min="0" step="0.01" defaultValue={item.recovery_amount || 0}/></Field><Field label="Legal costs"><input name="legal_costs" type="number" min="0" step="0.01" defaultValue={item.legal_costs || 0}/></Field></div>}
      <Field label="Confidential internal note"><textarea name="confidential_notes" rows={4} defaultValue={item?.confidential_notes || ""}/></Field><button className={styles.primaryButton}>{item?"Save matter":"Create matter"}</button>
    </form>
    {item && <div className={styles.dialog}><h3>Parties</h3>{(item.parties || []).length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Name</th><th>Role</th><th>Identifier</th></tr></thead><tbody>{item.parties.map((p:Row)=><tr key={p.id}><td>{p.name}</td><td>{p.role}</td><td>{p.identifier || "—"}</td></tr>)}</tbody></table></div> : <p className={styles.small}>No parties captured yet.</p>}<PartyForm matterId={item.id} mutate={mutate}/></div>}
  </>;
}

function PartyForm({matterId,mutate}:{matterId:number;mutate:any}) { return <form className={`${styles.form} ${styles.dialog}`} onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);mutate(`/api/v1/ops/matters/${matterId}/parties`,"POST",Object.fromEntries(f.entries()),"Party added");}}><div className={styles.sectionLabel}>Add matter party</div><div className={styles.grid2}><Field label="Name"><input name="name" required/></Field><Field label="Role"><input name="role" placeholder="client / respondent / witness" required/></Field></div><Field label="Identifier"><input name="identifier"/></Field><Field label="Contact summary"><textarea name="contact_summary" rows={2}/></Field><button className={styles.primaryButton}>Add party</button></form>; }

function ConflictEditor({item,newMode,mutate}:{item:Row|null;newMode:boolean;mutate:any}) {
  if (newMode) return <form className={styles.form} onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const payload:any=Object.fromEntries(f.entries());payload.related_names=String(payload.related_names||"").split(",").map(v=>v.trim()).filter(Boolean);mutate("/api/v1/ops/conflict-checks","POST",payload,"Conflict search completed");}}><div className={styles.sectionLabel}>Before accepting an instruction</div><h2>Run conflict check</h2><Field label="Primary subject / party"><input name="subject_name" required/></Field><Field label="Identifier"><input name="identifier" placeholder="ID, registration number or internal reference"/></Field><Field label="Related parties (comma separated)"><input name="related_names"/></Field><Field label="Requested for"><input name="requested_for" placeholder="Prospective client / matter"/></Field><button className={styles.primaryButton}>Run conflict search</button></form>;
  if (!item) return <Empty text="Select a conflict check or run a new one."/>;
  return <><div className={styles.sectionLabel}>Conflict check #{item.id}</div><h2>{item.subject_name}</h2><div className={styles.summary}><Info label="Status" value={item.status}/><Info label="Identifier" value={item.identifier||"—"}/><Info label="Hits" value={String((item.hits||[]).length)}/></div>{(item.hits||[]).length ? <div><h3>Potential matches</h3>{item.hits.map((hit:Row,index:number)=><div className={styles.hit} key={index}><strong>{hit.name}</strong><br/>{hit.source} • {hit.role} • {hit.reference || "no reference"}</div>)}</div> : <div className={`${styles.notice} ${styles.success}`}>No matching client, matter-party or consultation record was found by this system search.</div>}<form className={`${styles.form} ${styles.dialog}`} onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);mutate(`/api/v1/ops/conflict-checks/${item.id}/review`,"POST",Object.fromEntries(f.entries()),"Conflict decision recorded");}}><Field label="Review decision"><select name="status" defaultValue={item.status === "potential_conflict" ? "cleared_after_review" : item.status}><option>clear</option><option>cleared_after_review</option><option>conflict_confirmed</option></select></Field><Field label="Review note"><textarea name="review_note" rows={5} required defaultValue={item.review_note || ""}/></Field><button className={styles.primaryButton}>Record review</button></form></>;
}

function CourtEditor({item,newMode,matters,mutate}:{item:Row|null;newMode:boolean;matters:Row[];mutate:any}) {
  if (!item && !newMode) return <Empty text="Select a court diary entry or schedule one."/>;
  return <form className={styles.form} onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const payload:any=Object.fromEntries(f.entries());const matterId=Number(payload.matter_id);delete payload.matter_id;payload.scheduled_at=new Date(payload.scheduled_at).toISOString();mutate(item?`/api/v1/ops/court-events/${item.id}`:`/api/v1/ops/matters/${matterId}/court-events`,item?"PATCH":"POST",payload,item?"Court event updated":"Court event scheduled");}}><div className={styles.sectionLabel}>{item?item.matter_reference:"Court diary"}</div><h2>{item?.event_type || "Schedule court event"}</h2>{!item&&<Field label="Matter"><MatterSelect name="matter_id" matters={matters}/></Field>}<div className={styles.grid2}><Field label="Event type"><input name="event_type" required defaultValue={item?.event_type||"Hearing"}/></Field><Field label="Scheduled"><input name="scheduled_at" type="datetime-local" required defaultValue={isoLocal(item?.scheduled_at)}/></Field></div><div className={styles.grid2}><Field label="Court"><input name="court_name" defaultValue={item?.court_name||""}/></Field><Field label="Courtroom"><input name="courtroom" defaultValue={item?.courtroom||""}/></Field></div><Field label="Status"><select name="status" defaultValue={item?.status||"scheduled"}><option>scheduled</option><option>completed</option><option>postponed</option><option>cancelled</option></select></Field><Field label="Outcome"><textarea name="outcome" rows={3} defaultValue={item?.outcome||""}/></Field><Field label="Next step"><textarea name="next_step" rows={3} defaultValue={item?.next_step||""}/></Field><button className={styles.primaryButton}>{item?"Save court event":"Schedule event"}</button></form>;
}

function TaskEditor({item,newMode,matters,mutate}:{item:Row|null;newMode:boolean;matters:Row[];mutate:any}) {
  if (!item && !newMode) return <Empty text="Select a legal task or create one."/>;
  return <form className={styles.form} onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const payload:any=Object.fromEntries(f.entries());const matterId=Number(payload.matter_id);delete payload.matter_id;if(payload.due_at)payload.due_at=new Date(payload.due_at).toISOString();else payload.due_at=null;mutate(item?`/api/v1/ops/tasks/${item.id}`:`/api/v1/ops/matters/${matterId}/tasks`,item?"PATCH":"POST",payload,item?"Task updated":"Task created");}}><div className={styles.sectionLabel}>{item?item.matter_reference:"Matter task"}</div><h2>{item?.title||"Create legal task"}</h2>{!item&&<Field label="Matter"><MatterSelect name="matter_id" matters={matters}/></Field>}<Field label="Title"><input name="title" required defaultValue={item?.title||""}/></Field><Field label="Description"><textarea name="description" rows={4} defaultValue={item?.description||""}/></Field><div className={styles.grid2}><Field label="Assigned to"><input name="assigned_to" defaultValue={item?.assigned_to||""}/></Field><Field label="Due"><input name="due_at" type="datetime-local" defaultValue={isoLocal(item?.due_at)}/></Field></div><div className={styles.grid2}><Field label="Priority"><select name="priority" defaultValue={item?.priority||"normal"}><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></Field><Field label="Status"><select name="status" defaultValue={item?.status||"open"}><option>open</option><option>in_progress</option><option>blocked</option><option>completed</option><option>cancelled</option></select></Field></div><button className={styles.primaryButton}>{item?"Save task":"Create task"}</button></form>;
}

function ReferralEditor({item,mutate}:{item:Row|null;mutate:any}) {
  if (!item) return <Empty text="Select a referral received from Lelefa Debt Collectors."/>;
  const blocked = !["clear","cleared_after_review"].includes(item.conflict_status);
  return <><div className={styles.sectionLabel}>Lelefa Debt Collectors referral</div><h2>{item.external_reference}</h2><div className={styles.summary}><Info label="Creditor" value={item.creditor_name}/><Info label="Debtor ref" value={item.debtor_reference}/><Info label="Outstanding" value={money(item.outstanding_balance)}/><Info label="Referral status" value={item.status}/><Info label="Conflict" value={item.conflict_status}/><Info label="Collection stage" value={item.collection_stage||"—"}/></div><Field label="Legal reason"><textarea readOnly rows={4} value={item.legal_reason||""}/></Field><Field label="Authority reference"><input readOnly value={item.authority_reference||""}/></Field>{(item.conflict_hits||[]).length>0&&<div>{item.conflict_hits.map((hit:Row,i:number)=><div className={styles.hit} key={i}><strong>{hit.name}</strong> • {hit.role} • {hit.reference}</div>)}</div>}
    {item.conflict_status === "potential_conflict" && <form className={`${styles.form} ${styles.dialog}`} onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);mutate(`/api/v1/ops/recovery-referrals/${item.id}/conflict-decision`,"POST",Object.fromEntries(f.entries()),"Referral conflict decision recorded");}}><Field label="Conflict decision"><select name="conflict_status"><option value="cleared_after_review">cleared_after_review</option><option value="conflict_confirmed">conflict_confirmed</option></select></Field><Field label="Review note"><textarea name="review_note" rows={4} required/></Field><button className={styles.primaryButton}>Record conflict review</button></form>}
    {item.status === "pending_review" && <div className={`${styles.actions} ${styles.dialog}`}><button className={styles.primaryButton} disabled={blocked} onClick={()=>mutate(`/api/v1/ops/recovery-referrals/${item.id}/accept`,"POST",{review_note:"Accepted into Chambers legal operations after mandate/conflict review."},"Referral accepted and legal matter created")}>Accept into Chambers</button><button className={styles.dangerButton} onClick={()=>mutate(`/api/v1/ops/recovery-referrals/${item.id}/decline`,"POST",{review_note:"Declined during Chambers intake review."},"Referral declined")}>Decline</button>{blocked&&<span className={styles.small}>Resolve conflict status before acceptance.</span>}</div>}
    {item.matter_id && <p className={`${styles.notice} ${styles.success}`}>Accepted as Chambers matter #{item.matter_id}.</p>}
  </>;
}

function CredentialEditor({item,newMode,professionals,mutate}:{item:Row|null;newMode:boolean;professionals:Row[];mutate:any}) {
  if (!item && !newMode) return <Empty text="Select a professional credential or add one."/>;
  if (item) return <><div className={styles.sectionLabel}>Professional credential</div><h2>{item.credential_type}</h2><div className={styles.summary}><Info label="Professional" value={item.professional_name||"—"}/><Info label="Issuer" value={item.issuer||"—"}/><Info label="Expiry" value={item.expiry_date||"—"}/></div><p className={styles.small}>Reference: {item.reference_number||"—"}<br/>Public: {item.is_public?"Yes":"No"}<br/>Verified: {item.verified_at?prettyDate(item.verified_at):"Not yet"}</p><button className={styles.dangerButton} onClick={()=>mutate(`/api/v1/ops/credentials/${item.id}`,"DELETE",undefined,"Credential removed")}>Delete credential</button></>;
  return <form className={styles.form} onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const payload:any=Object.fromEntries(f.entries());payload.professional_id=Number(payload.professional_id);payload.is_public=f.get("is_public")==="on";payload.verified=f.get("verified")==="on";mutate("/api/v1/ops/credentials","POST",payload,"Credential added");}}><div className={styles.sectionLabel}>Credential register</div><h2>Add professional credential</h2><Field label="Professional"><select name="professional_id" required defaultValue=""><option value="" disabled>Select professional</option>{professionals.map(p=><option value={p.id} key={p.id}>{p.full_name}</option>)}</select></Field><Field label="Credential type"><input name="credential_type" required placeholder="Practising certificate / admission / LLB"/></Field><div className={styles.grid2}><Field label="Issuer"><input name="issuer"/></Field><Field label="Reference number"><input name="reference_number"/></Field></div><div className={styles.grid2}><Field label="Issue date"><input name="issue_date" type="date"/></Field><Field label="Expiry date"><input name="expiry_date" type="date"/></Field></div><Field label="Document URL"><input name="document_url"/></Field><label><input type="checkbox" name="is_public"/> Publicly displayable</label><label><input type="checkbox" name="verified"/> Mark verified</label><button className={styles.primaryButton}>Add credential</button></form>;
}

function UserEditor({item,newMode,currentUser,mutate}:{item:Row|null;newMode:boolean;currentUser:Row;mutate:any}) {
  if (!item && !newMode) return <Empty text={currentUser.role === "system_owner" ? "Select a user or create one." : "User management is restricted to the System Owner."}/>;
  if (currentUser.role !== "system_owner") return <div className={styles.notice}>Only the System Owner can create, deactivate, change roles or reset passwords for Chambers accounts.</div>;
  return <form className={styles.form} onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const payload:any=Object.fromEntries(f.entries());payload.is_active=f.get("is_active")==="on";if(item){delete payload.email; if(!payload.new_password)delete payload.new_password;}else{payload.password=payload.new_password;delete payload.new_password;}mutate(item?`/api/v1/ops/users/${item.id}`:"/api/v1/ops/users",item?"PATCH":"POST",payload,item?"User updated":"User created");}}><div className={styles.sectionLabel}>{item?"Chambers user":"New account"}</div><h2>{item?.full_name||"Create user"}</h2>{!item&&<Field label="Email"><input name="email" type="email" required/></Field>}<Field label="Full name"><input name="full_name" required defaultValue={item?.full_name||""}/></Field><Field label="Role"><select name="role" defaultValue={item?.role||"advocate"}>{["system_owner","chambers_admin","managing_advocate","advocate","content_editor","reception","auditor"].map(v=><option key={v}>{v}</option>)}</select></Field><Field label={item?"New password (leave blank to keep current)":"Temporary password"}><input name="new_password" type="password" minLength={12} required={!item}/></Field><label><input type="checkbox" name="is_active" defaultChecked={item?.is_active ?? true}/> Active account</label><button className={styles.primaryButton}>{item?"Save user":"Create user"}</button></form>;
}

function MediaEditor({item,token,setMessage,refresh}:{item:Row|null;token:string;setMessage:any;refresh:()=>Promise<void>}) {
  async function upload(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=new FormData(e.currentTarget);setMessage(null);try{await request("/api/v1/admin/media",token,{method:"POST",body:form});setMessage({kind:"success",text:"Media uploaded."});e.currentTarget.reset();await refresh();}catch(error){setMessage({kind:"error",text:error instanceof Error?error.message:"Upload failed"});}}
  return <><form className={styles.form} onSubmit={upload}><div className={styles.sectionLabel}>Media library</div><h2>Upload approved media</h2><p className={styles.small}>Current boundary accepts JPG, PNG, WebP and PDF up to the configured limit. Legal evidence should not be uploaded here; Phase 2 matter documents use a private document store.</p><Field label="File"><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required/></Field><button className={styles.primaryButton}>Upload</button></form>{item&&<div className={styles.dialog}><h3>{item.original_name}</h3><p className={styles.small}>{item.content_type} • {Math.round((item.size_bytes||0)/1024)} KB<br/>{item.public_url}</p>{String(item.content_type).startsWith("image/")&&<img src={`${API}${item.public_url}`} alt={item.original_name} style={{maxWidth:"100%",borderRadius:14}}/>}</div>}</>;
}

function MatterSelect({name,matters}:{name:string;matters:Row[]}) { return <select name={name} required defaultValue=""><option value="" disabled>Select matter</option>{matters.map(m=><option value={m.id} key={m.id}>{m.matter_reference} — {m.title}</option>)}</select>; }
function Field({label,children}:{label:string;children:React.ReactNode}) { return <div className={styles.field}><label>{label}</label>{children}</div>; }
function Info({label,value}:{label:string;value:string}) { return <div className={styles.summaryItem}><small>{label}</small><strong>{value}</strong></div>; }
function Empty({text}:{text:string}) { return <div className={styles.empty}>{text}</div>; }
