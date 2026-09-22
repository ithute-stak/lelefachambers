"use client";

import { FormEvent, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type Row = Record<string, any>;
type Tab = "dashboard" | "reminders" | "installments" | "payments";

async function api(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

export default function AutomationWorkspace() {
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<Row>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [settlements, setSettlements] = useState<Row[]>([]);
  const [matters, setMatters] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(window.localStorage.getItem("lelefa_chambers_token") || "");
  }, []);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api("/api/v1/ops/settlements", token).then(setSettlements),
      api("/api/v1/ops/matters", token).then(setMatters)
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
        setDashboard(await api("/api/v1/ops/automation/dashboard", token));
        setRows([]);
      } else {
        const path = active === "reminders" ? "/api/v1/ops/reminders?status=pending" : active === "installments" ? "/api/v1/ops/settlement-installments" : "/api/v1/ops/ithute-pay/requests";
        setRows(await api(path, token));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load automation data");
    } finally {
      setBusy(false);
    }
  }

  async function post(path: string, payload: any = {}) {
    setBusy(true); setMessage("");
    try {
      const result = await api(path, token, { method: "POST", body: JSON.stringify(payload) });
      setMessage("Action completed successfully.");
      await load(tab);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function patch(path: string, payload: any) {
    setBusy(true); setMessage("");
    try {
      await api(path, token, { method: "PATCH", body: JSON.stringify(payload) });
      setMessage("Updated successfully.");
      await load(tab);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <div className="admin-shell"><div className="login-card"><div className="eyebrow">Recovery Automation</div><h1>Sign in first</h1><p className="muted">Use the Chambers administration login before opening this workspace.</p><a href="/chambers-admin" className="button">Go to Chambers Admin</a></div></div>;
  }

  return (
    <div className="admin-shell">
      <div className="admin-card">
        <header className="admin-head">
          <div><strong>Recovery Automation & Payments</strong><div style={{fontSize:12,opacity:.75}}>Schedules • Reminders • Ithute Pay • Allocation</div></div>
          <a href="/chambers-admin/recovery" className="button button-light button-small">Recovery Workspace</a>
        </header>
        <div className={`admin-body ${busy ? "loading" : ""}`}>
          <div className="admin-tabs">
            {(["dashboard","reminders","installments","payments"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "payments" ? "Ithute Pay" : item}</button>)}
          </div>
          {message && <p className="notice">{message}</p>}

          {tab === "dashboard" && <Dashboard data={dashboard} onScan={() => post("/api/v1/ops/automation/scan")} />}
          {tab === "reminders" && <Reminders rows={rows} onAcknowledge={(id) => patch(`/api/v1/ops/reminders/${id}`, {status:"acknowledged"})} onDismiss={(id) => patch(`/api/v1/ops/reminders/${id}`, {status:"dismissed"})} />}
          {tab === "installments" && <Installments rows={rows} settlements={settlements} onGenerate={(settlementId, payload) => post(`/api/v1/ops/settlements/${settlementId}/installments/generate`, payload)} />}
          {tab === "payments" && <IthutePay rows={rows} matters={matters} settlements={settlements} enabled={Boolean(dashboard.ithute_pay_enabled)} onCreate={(matterId,payload) => post(`/api/v1/ops/matters/${matterId}/ithute-pay/payment-request`,payload)} onRefresh={(id)=>post(`/api/v1/ops/ithute-pay/requests/${id}/refresh`)} />}
        </div>
      </div>
    </div>
  );
}

function Dashboard({data,onScan}:{data:Row;onScan:()=>void}) {
  const stats = [["Pending reminders",data.pending_reminders],["Overdue installments",data.overdue_installments],["Due / partial installments",data.due_installments],["Active Ithute Pay requests",data.ithute_pay_active_requests]];
  return <><div className="eyebrow">Automated controls</div><h2 style={{fontFamily:"Georgia,serif",fontSize:"2.4rem"}}>Recovery control loop</h2><div className="admin-grid">{stats.map(([label,value])=><div className="admin-stat" key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div><div className="content-grid" style={{marginTop:24}}><div className="content-card"><h2 style={{fontSize:"1.8rem"}}>Automation worker</h2><p>The worker scans court events, legal tasks, settlement installments and professional credential expiry. It also auto-allocates matched settlement payments to the oldest unpaid installment.</p><button className="button" onClick={onScan}>Run scan now</button></div><div className="content-card"><h2 style={{fontSize:"1.8rem"}}>Ithute Pay</h2><p className={data.ithute_pay_enabled ? "notice success" : "notice"}>{data.ithute_pay_enabled ? "Integration enabled for this environment." : "Integration is deliberately disabled until a Chambers Ithute Pay application key and webhook secret are configured."}</p><p className="muted">Provider credentials remain inside Ithute Pay; Lelefa Chambers stores only its payment references, statuses and recovery allocations.</p></div></div></>;
}

function Reminders({rows,onAcknowledge,onDismiss}:{rows:Row[];onAcknowledge:(id:number)=>void;onDismiss:(id:number)=>void}) {
  return <div><div className="eyebrow">Reminder centre</div><h2 style={{fontFamily:"Georgia,serif",fontSize:"2.2rem"}}>Court, task, settlement & credential reminders</h2><div className="admin-list">{rows.map((row)=><div className="admin-row" key={row.id}><span><strong>{row.title}</strong><br/><small className="muted">{row.reminder_type.replaceAll("_"," ")} • due {new Date(row.due_at).toLocaleString()} • {row.severity}</small><br/><small>{row.message}</small></span><span style={{display:"flex",gap:6,alignItems:"center"}}><button className="button button-small" onClick={()=>onAcknowledge(row.id)}>Acknowledge</button><button className="admin-tabs" style={{border:0,background:"transparent"}} onClick={()=>onDismiss(row.id)}>Dismiss</button></span></div>)}{!rows.length&&<p className="muted">No pending reminders.</p>}</div></div>;
}

function Installments({rows,settlements,onGenerate}:{rows:Row[];settlements:Row[];onGenerate:(id:number,payload:Row)=>void}) {
  return <div className="content-grid"><div className="content-card"><div className="eyebrow">Payment schedule</div><h2 style={{fontSize:"2rem"}}>Settlement installments</h2><div className="admin-list">{rows.map((row)=><div className="admin-row" key={row.id}><span><strong>Installment #{row.sequence_no}</strong><br/><small className="muted">Due {row.due_date} • M {money(row.amount_due)} • paid M {money(row.amount_paid)}</small></span><span className="status-pill">{row.status}</span></div>)}{!rows.length&&<p className="muted">No installment schedules yet.</p>}</div></div><ScheduleForm settlements={settlements} onGenerate={onGenerate}/></div>;
}

function ScheduleForm({settlements,onGenerate}:{settlements:Row[];onGenerate:(id:number,payload:Row)=>void}) {
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=new FormData(e.currentTarget);onGenerate(Number(form.get("settlement_id")),{installment_count:form.get("installment_count")?Number(form.get("installment_count")):null,grace_days:Number(form.get("grace_days")||3),replace_existing:form.get("replace_existing")==="on"});}
  return <form className="content-card" onSubmit={submit}><div className="eyebrow">Generate</div><h2 style={{fontSize:"2rem"}}>Create installment schedule</h2><Field label="Settlement"><select name="settlement_id" required defaultValue=""><option value="" disabled>Select settlement</option>{settlements.filter(s=>!["cancelled","rejected"].includes(s.status)).map(s=><option key={s.id} value={s.id}>{s.settlement_reference} — M {money(s.agreed_amount)}</option>)}</select></Field><Field label="Installment count (optional)"><input name="installment_count" type="number" min="1" max="240"/></Field><Field label="Grace days"><input name="grace_days" type="number" min="0" max="90" defaultValue="3"/></Field><label style={{display:"flex",gap:8,marginBottom:16}}><input name="replace_existing" type="checkbox"/> Replace existing schedule if it has no allocations</label><button className="button">Generate schedule</button></form>;
}

function IthutePay({rows,matters,settlements,enabled,onCreate,onRefresh}:{rows:Row[];matters:Row[];settlements:Row[];enabled:boolean;onCreate:(id:number,payload:Row)=>void;onRefresh:(id:number)=>void}) {
  return <div className="content-grid"><div className="content-card"><div className="eyebrow">Central payment platform</div><h2 style={{fontSize:"2rem"}}>Ithute Pay requests</h2><p className="muted">Lelefa Chambers consumes the central Ithute Pay API. Provider credentials, routing and provider-specific logic remain in Ithute Pay.</p><div className="admin-list">{rows.map((row)=><div className="admin-row" key={row.id}><span><strong>M {money(row.amount)} • {row.reference}</strong><br/><small className="muted">{row.customer_phone} • {row.provider} • {row.public_id || "not created remotely"}</small></span><span style={{display:"grid",gap:6,justifyItems:"end"}}><span className="status-pill">{row.status}</span>{row.public_id&&<button className="button button-small" onClick={()=>onRefresh(row.id)}>Refresh</button>}</span></div>)}{!rows.length&&<p className="muted">No Ithute Pay requests yet.</p>}</div></div><PaymentRequestForm matters={matters} settlements={settlements} enabled={enabled} onCreate={onCreate}/></div>;
}

function PaymentRequestForm({matters,settlements,enabled,onCreate}:{matters:Row[];settlements:Row[];enabled:boolean;onCreate:(id:number,payload:Row)=>void}) {
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=new FormData(e.currentTarget);onCreate(Number(form.get("matter_id")),{amount:Number(form.get("amount")),customer_phone:form.get("customer_phone"),customer_name:form.get("customer_name")||null,provider:form.get("provider")||"mpesa",payment_method:"mobile_money",settlement_id:form.get("settlement_id")?Number(form.get("settlement_id")):null,description:form.get("description")||null});}
  return <form className="content-card" onSubmit={submit}><div className="eyebrow">Collect through Ithute Pay</div><h2 style={{fontSize:"2rem"}}>Request debtor payment</h2>{!enabled&&<p className="notice">Disabled until the server receives a Chambers Ithute Pay application key and webhook secret.</p>}<Field label="Matter"><select name="matter_id" required defaultValue=""><option value="" disabled>Select matter</option>{matters.map(m=><option key={m.id} value={m.id}>{m.matter_reference} — {m.title}</option>)}</select></Field><Field label="Settlement (optional)"><select name="settlement_id" defaultValue=""><option value="">No settlement link</option>{settlements.map(s=><option key={s.id} value={s.id}>{s.settlement_reference}</option>)}</select></Field><Field label="Amount"><input name="amount" type="number" min="0.01" step="0.01" required/></Field><Field label="Debtor mobile number"><input name="customer_phone" placeholder="26658..." required/></Field><Field label="Debtor name"><input name="customer_name"/></Field><Field label="Provider"><select name="provider" defaultValue="mpesa"><option value="mpesa">M-Pesa</option><option value="ecocash">EcoCash</option></select></Field><Field label="Description"><input name="description" placeholder="Settlement installment / recovery payment"/></Field><button className="button" disabled={!enabled}>Create payment request</button></form>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="field" style={{marginBottom:13}}><label>{label}</label>{children}</div>}
function money(v:any){const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):"0.00";}
