"use client";

import { FormEvent, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type Row = Record<string, any>;
type Tab = "dashboard" | "documents" | "settlements" | "judgments" | "executions" | "payments" | "portal";

async function api(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(data?.detail || `Request failed (${response.status})`);
  return data;
}

export default function RecoveryWorkspace() {
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<Row>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [matters, setMatters] = useState<Row[]>([]);
  const [clients, setClients] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("lelefa_chambers_token") || "";
    setToken(saved);
  }, []);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api("/api/v1/ops/matters", token).then(setMatters),
      api("/api/v1/ops/clients", token).then(setClients)
    ]).catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load reference data"));
  }, [token]);

  useEffect(() => {
    if (token) load(tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  async function load(active: Tab) {
    setBusy(true); setMessage("");
    try {
      if (active === "dashboard") {
        setDashboard(await api("/api/v1/ops/recovery/dashboard", token));
        setRows([]);
      } else if (active === "documents") {
        setRows([]);
      } else {
        const paths: Record<Exclude<Tab,"dashboard"|"documents">, string> = {
          settlements: "/api/v1/ops/settlements",
          judgments: "/api/v1/ops/judgments",
          executions: "/api/v1/ops/executions",
          payments: "/api/v1/ops/recovery-payments",
          portal: "/api/v1/ops/client-portal-users"
        };
        setRows(await api(paths[active], token));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load recovery data");
    } finally {
      setBusy(false);
    }
  }

  async function submit(path: string, payload: any, method = "POST") {
    setBusy(true); setMessage("");
    try {
      await api(path, token, { method, body: JSON.stringify(payload) });
      setMessage("Saved successfully.");
      await load(tab);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const matterId = form.get("matter_id");
    form.delete("matter_id");
    setBusy(true); setMessage("");
    try {
      await api(`/api/v1/ops/matters/${matterId}/documents`, token, { method: "POST", body: form });
      event.currentTarget.reset();
      setMessage("Private matter document uploaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload document");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <div className="admin-shell"><div className="login-card"><div className="eyebrow">Lelefa Chambers Recovery</div><h1>Sign in first</h1><p className="muted">Use the main Chambers administration login, then return to this recovery workspace.</p><a className="button" href="/chambers-admin">Go to Chambers Admin</a></div></div>;
  }

  return (
    <div className="admin-shell">
      <div className="admin-card">
        <header className="admin-head">
          <div><strong>Legal Recovery & Institutional Portal</strong><div style={{fontSize:12,opacity:.75}}>Settlements • Judgments • Execution • Payments • Documents</div></div>
          <a className="button button-light button-small" href="/chambers-admin/operations">Legal Operations</a>
        </header>
        <div className={`admin-body ${busy ? "loading" : ""}`}>
          <div className="admin-tabs">
            {(["dashboard","documents","settlements","judgments","executions","payments","portal"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "portal" ? "client portal" : item}</button>)}
          </div>
          {message && <p className="notice">{message}</p>}

          {tab === "dashboard" && <Dashboard data={dashboard} />}
          {tab === "documents" && <Documents matters={matters} onUpload={uploadDocument} />}
          {tab === "settlements" && <TwoColumn title="Settlements" rows={rows} render={(row) => <Record row={row} headline={row.settlement_reference} detail={`M ${money(row.agreed_amount)} • ${row.status} • paid M ${money(row.paid_amount)}`} />} form={<SettlementForm matters={matters} onSubmit={submit} />} />}
          {tab === "judgments" && <TwoColumn title="Judgments" rows={rows} render={(row) => <Record row={row} headline={row.judgment_reference} detail={`M ${money(row.total_awarded)} • ${row.status} • balance M ${money(row.balance)}`} />} form={<JudgmentForm matters={matters} onSubmit={submit} />} />}
          {tab === "executions" && <TwoColumn title="Execution actions" rows={rows} render={(row) => <Record row={row} headline={String(row.action_type || "").replaceAll("_"," ")} detail={`${row.matter_reference || ""} • ${row.status}`} />} form={<ExecutionForm matters={matters} onSubmit={submit} />} />}
          {tab === "payments" && <TwoColumn title="Recovery payments" rows={rows} render={(row) => <Record row={row} headline={`M ${money(row.amount)}`} detail={`${row.payment_reference} • ${row.status} • ${row.remittance_status}`} />} form={<PaymentForm matters={matters} onSubmit={submit} />} />}
          {tab === "portal" && <TwoColumn title="Institutional client users" rows={rows} render={(row) => <Record row={row} headline={row.full_name} detail={`${row.client_name || ""} • ${row.email} • ${row.role} • ${row.is_active ? "active" : "disabled"}`} />} form={<PortalForm clients={clients} onSubmit={submit} />} />}
        </div>
      </div>
    </div>
  );
}

function Dashboard({data}:{data:Row}) {
  const stats = [
    ["Active settlements",data.active_settlements], ["Unsatisfied judgments",data.unsatisfied_judgments], ["Active execution",data.active_execution_actions],
    ["Unallocated payments",data.unallocated_payments], ["Private documents",data.private_documents], ["Portal users",data.portal_users]
  ];
  return <><div className="eyebrow">Recovery control</div><h2 style={{fontFamily:"Georgia,serif",fontSize:"2.4rem"}}>Recovery command centre</h2><div className="admin-grid">{stats.map(([label,value]) => <div className="admin-stat" key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div><div className="content-grid" style={{marginTop:24}}><div className="content-card"><div className="eyebrow">Matched recovery</div><h2 style={{fontSize:"2.2rem"}}>M {money(data.matched_recovery_total)}</h2><p className="muted">Payments marked matched and allocated to Chambers matters.</p></div><div className="content-card"><div className="eyebrow">Unallocated value</div><h2 style={{fontSize:"2.2rem"}}>M {money(data.unallocated_value)}</h2><p className="muted">Money recorded but not yet confidently allocated to the correct matter.</p></div></div></>;
}

function Documents({matters,onUpload}:{matters:Row[];onUpload:(e:FormEvent<HTMLFormElement>)=>void}) {
  return <div className="content-grid"><div className="content-card"><div className="eyebrow">Private vault</div><h2 style={{fontSize:"2rem"}}>Matter document vault</h2><p className="muted">Legal evidence and matter documents are stored outside the public media directory. Client-visible documents remain authenticated through the institutional portal.</p><ul><li>SHA-256 checksum captured at upload</li><li>Internal/client visibility control</li><li>No direct public static URL</li><li>Authenticated staff/client downloads</li></ul></div><form className="content-card" onSubmit={onUpload}><div className="eyebrow">Upload document</div><MatterSelect matters={matters}/><Field label="Category"><select name="category" defaultValue="pleading"><option>instruction</option><option>demand</option><option>pleading</option><option>evidence</option><option>court_order</option><option>judgment</option><option>settlement</option><option>execution</option><option>correspondence</option></select></Field><Field label="Title"><input name="title" required /></Field><Field label="Visibility"><select name="visibility" defaultValue="internal"><option value="internal">Internal only</option><option value="client">Client visible</option></select></Field><Field label="Description"><textarea name="description" rows={3}/></Field><Field label="File"><input name="file" type="file" accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp" required /></Field><button className="button">Upload to private vault</button></form></div>;
}

function SettlementForm({matters,onSubmit}:{matters:Row[];onSubmit:(p:string,d:any)=>void}) { return <Form title="New settlement" onSubmit={(form) => { const matterId=form.get("matter_id"); onSubmit(`/api/v1/ops/matters/${matterId}/settlements`,{agreed_amount:Number(form.get("agreed_amount")),accepted_date:form.get("accepted_date")||null,first_due_date:form.get("first_due_date")||null,installment_amount:form.get("installment_amount")?Number(form.get("installment_amount")):null,frequency:form.get("frequency")||null,terms:form.get("terms")||null,status:form.get("status")}); }}><MatterSelect matters={matters}/><Field label="Agreed amount"><input name="agreed_amount" type="number" step="0.01" min="0.01" required/></Field><Field label="Accepted date"><input name="accepted_date" type="date"/></Field><Field label="First due date"><input name="first_due_date" type="date"/></Field><Field label="Installment amount"><input name="installment_amount" type="number" step="0.01"/></Field><Field label="Frequency"><select name="frequency" defaultValue="monthly"><option>once</option><option>weekly</option><option>fortnightly</option><option>monthly</option><option>custom</option></select></Field><Field label="Status"><select name="status" defaultValue="approved"><option>proposed</option><option>approved</option><option>active</option></select></Field><Field label="Terms"><textarea name="terms" rows={4}/></Field></Form>; }

function JudgmentForm({matters,onSubmit}:{matters:Row[];onSubmit:(p:string,d:any)=>void}) { return <Form title="Record judgment" onSubmit={(form)=>{const matterId=form.get("matter_id");onSubmit(`/api/v1/ops/matters/${matterId}/judgments`,{judgment_reference:form.get("judgment_reference"),judgment_date:form.get("judgment_date"),court_name:form.get("court_name"),principal_amount:Number(form.get("principal_amount")||0),interest_amount:Number(form.get("interest_amount")||0),legal_costs_amount:Number(form.get("legal_costs_amount")||0),total_awarded:Number(form.get("total_awarded")),status:"unsatisfied",notes:form.get("notes")||null});}}><MatterSelect matters={matters}/><Field label="Judgment reference"><input name="judgment_reference" required/></Field><Field label="Judgment date"><input name="judgment_date" type="date" required/></Field><Field label="Court"><input name="court_name" required/></Field><Field label="Principal"><input name="principal_amount" type="number" step="0.01"/></Field><Field label="Interest"><input name="interest_amount" type="number" step="0.01"/></Field><Field label="Legal costs"><input name="legal_costs_amount" type="number" step="0.01"/></Field><Field label="Total awarded"><input name="total_awarded" type="number" step="0.01" min="0.01" required/></Field><Field label="Notes"><textarea name="notes" rows={3}/></Field></Form>; }

function ExecutionForm({matters,onSubmit}:{matters:Row[];onSubmit:(p:string,d:any)=>void}) { return <Form title="New execution action" onSubmit={(form)=>{const matterId=form.get("matter_id");onSubmit(`/api/v1/ops/matters/${matterId}/executions`,{action_type:form.get("action_type"),status:form.get("status"),requested_at:form.get("requested_at")?new Date(String(form.get("requested_at"))).toISOString():null,officer_or_sheriff:form.get("officer_or_sheriff")||null,external_reference:form.get("external_reference")||null,target_asset_or_income:form.get("target_asset_or_income")||null,next_step:form.get("next_step")||null});}}><MatterSelect matters={matters}/><Field label="Action type"><select name="action_type"><option value="warrant_execution">Warrant of execution</option><option value="attachment">Attachment</option><option value="garnishee">Garnishee</option><option value="sale_in_execution">Sale in execution</option><option value="emolument">Emolument</option><option value="other">Other</option></select></Field><Field label="Status"><select name="status" defaultValue="planned"><option>planned</option><option>filed</option><option>issued</option><option>served</option><option>in_progress</option></select></Field><Field label="Requested at"><input name="requested_at" type="datetime-local"/></Field><Field label="Sheriff / officer"><input name="officer_or_sheriff"/></Field><Field label="External reference"><input name="external_reference"/></Field><Field label="Target asset / income"><textarea name="target_asset_or_income" rows={3}/></Field><Field label="Next step"><textarea name="next_step" rows={3}/></Field></Form>; }

function PaymentForm({matters,onSubmit}:{matters:Row[];onSubmit:(p:string,d:any)=>void}) { return <Form title="Record recovery payment" onSubmit={(form)=>onSubmit("/api/v1/ops/recovery-payments",{matter_id:Number(form.get("matter_id")),amount:Number(form.get("amount")),received_at:new Date(String(form.get("received_at"))).toISOString(),payment_reference:form.get("payment_reference"),bank_reference:form.get("bank_reference")||null,channel:form.get("channel")||null,payer_name:form.get("payer_name")||null,source:form.get("source")||"manual",status:form.get("status"),reconciliation_note:form.get("reconciliation_note")||null})}><MatterSelect matters={matters}/><Field label="Amount"><input name="amount" type="number" step="0.01" min="0.01" required/></Field><Field label="Received at"><input name="received_at" type="datetime-local" required/></Field><Field label="Payment reference"><input name="payment_reference" required/></Field><Field label="Bank reference"><input name="bank_reference"/></Field><Field label="Channel"><input name="channel" placeholder="EFT / cash / mobile / other"/></Field><Field label="Payer"><input name="payer_name"/></Field><Field label="Source"><input name="source" defaultValue="manual"/></Field><Field label="Status"><select name="status" defaultValue="matched"><option>pending</option><option>matched</option><option>unallocated</option></select></Field><Field label="Reconciliation note"><textarea name="reconciliation_note" rows={3}/></Field></Form>; }

function PortalForm({clients,onSubmit}:{clients:Row[];onSubmit:(p:string,d:any)=>void}) { return <Form title="Create client portal user" onSubmit={(form)=>onSubmit("/api/v1/ops/client-portal-users",{client_id:Number(form.get("client_id")),email:form.get("email"),full_name:form.get("full_name"),role:form.get("role"),password:form.get("password"),is_active:true})}><Field label="Client"><select name="client_id" required defaultValue=""><option value="" disabled>Select client</option>{clients.map((c)=><option key={c.id} value={c.id}>{c.name} ({c.client_code})</option>)}</select></Field><Field label="Full name"><input name="full_name" required/></Field><Field label="Email"><input name="email" type="email" required/></Field><Field label="Role"><select name="role" defaultValue="manager"><option>manager</option><option>legal</option><option>finance</option><option>viewer</option></select></Field><Field label="Temporary password"><input name="password" type="password" minLength={12} required/></Field></Form>; }

function Form({title,onSubmit,children}:{title:string;onSubmit:(form:FormData)=>void;children:React.ReactNode}) { return <form className="content-card" onSubmit={(e)=>{e.preventDefault();onSubmit(new FormData(e.currentTarget));}}><div className="eyebrow">Create record</div><h2 style={{fontSize:"2rem"}}>{title}</h2>{children}<button className="button">Save</button></form>; }
function Field({label,children}:{label:string;children:React.ReactNode}) { return <div className="field" style={{marginBottom:13}}><label>{label}</label>{children}</div>; }
function MatterSelect({matters}:{matters:Row[]}) { return <Field label="Matter"><select name="matter_id" required defaultValue=""><option value="" disabled>Select matter</option>{matters.map((m)=><option key={m.id} value={m.id}>{m.matter_reference} — {m.title}</option>)}</select></Field>; }
function TwoColumn({title,rows,render,form}:{title:string;rows:Row[];render:(row:Row)=>React.ReactNode;form:React.ReactNode}) { return <div className="content-grid"><div className="content-card"><div className="eyebrow">Register</div><h2 style={{fontSize:"2rem"}}>{title}</h2><div className="admin-list">{rows.map((row)=>render(row))}{!rows.length&&<p className="muted">No records yet.</p>}</div></div>{form}</div>; }
function Record({row,headline,detail}:{row:Row;headline:string;detail:string}) { return <div className="admin-row"><span><strong>{headline}</strong><br/><small className="muted">{detail}</small></span><span className="status-pill">{row.status || "record"}</span></div>; }
function money(value:any){const n=Number(value||0);return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):"0.00";}
