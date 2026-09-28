"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Preview = {
  eligible: boolean;
  blockers: string[];
  warnings: string[];
  subject: string;
  deadline: string;
  amount_summary: Record<string, string>;
  html: string | null;
  verification: { snapshot: { inputs_hash: string; total_repayable: string; payments_credited: string; verified_outstanding: string } };
};

type Matter = { id: number; matter_reference?: string; title?: string };
type Payload = Record<string, any>;

const methods = [
  ["micro_loan", "LoanHub Micro Loan Method"],
  ["simple_interest", "Simple Interest"],
  ["flat_rate", "Flat Rate"],
  ["compound_interest", "Compound Interest"],
  ["reducing_balance_amortised", "Reducing Balance / Amortised"],
  ["daily_accrual_reducing_balance", "Daily Accrual Reducing Balance"],
];

export default function DocumentStudioPage() {
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [matterId, setMatterId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");

  useEffect(() => setToken(window.localStorage.getItem("lelefa_chambers_token") || ""), []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/v1/ops/matters`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => response.ok ? response.json() : [])
      .then((data) => setMatters(Array.isArray(data) ? data : []))
      .catch(() => setMatters([]));
  }, [token]);

  const verificationHash = useMemo(() => preview?.verification?.snapshot?.inputs_hash || "", [preview]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setPreview(null);
    setPayload(null);
    const form = new FormData(event.currentTarget);
    const payments = Number(form.get("payment_amount") || 0) > 0 ? [{
      amount: Number(form.get("payment_amount")),
      paid_on: form.get("payment_date") || null,
      reference: form.get("payment_reference") || null,
    }] : [];
    const nextPayload = {
      verification: {
        debtor_name: form.get("debtor_name"),
        national_id: form.get("national_id"),
        source_reference: form.get("source_reference"),
        loan_date: form.get("loan_date"),
        principal: Number(form.get("principal")),
        annual_rate_percent: Number(form.get("rate")),
        term_months: Number(form.get("term_months")),
        method: form.get("method"),
        processing_fee: Number(form.get("processing_fee") || 0),
        payments,
        claimed_outstanding: Number(form.get("claimed_outstanding")),
        as_of_date: form.get("as_of_date"),
        tolerance: 0.01,
      },
      client_name: form.get("client_name"),
      client_reference: form.get("client_reference") || null,
      chambers_reference: form.get("chambers_reference"),
      debtor_address: form.get("debtor_address") || null,
      demand_days: Number(form.get("demand_days") || 7),
      payment_instructions: form.get("payment_instructions") || null,
      additional_notice: form.get("additional_notice") || null,
      signatory_name: form.get("signatory_name"),
      signatory_title: form.get("signatory_title"),
      letter_date: form.get("letter_date"),
    };

    try {
      const response = await fetch(`${API}/api/v1/document-studio/demand-letter/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(nextPayload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Unable to prepare document");
      setPreview(data);
      setPayload(nextPayload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to prepare document");
    } finally {
      setBusy(false);
    }
  }

  async function download(format: "docx" | "pdf") {
    if (!payload || !preview?.eligible) return;
    setActionBusy(format);
    setMessage("");
    try {
      const response = await fetch(`${API}/api/v1/document-studio/demand-letter/render-${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.detail === "string" ? data.detail : `Unable to generate ${format.toUpperCase()}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${String(payload.verification.source_reference || "Demand")}_Formal_Demand.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to generate ${format.toUpperCase()}`);
    } finally {
      setActionBusy("");
    }
  }

  async function saveToMatter() {
    if (!payload || !preview?.eligible || !matterId) return;
    setActionBusy("vault");
    setMessage("");
    try {
      const response = await fetch(`${API}/api/v1/document-studio/demand-letter/save-to-matter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...payload, matter_id: Number(matterId), visibility: "internal", formats: ["docx", "pdf"] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Unable to save demand letter");
      setMessage(`Saved ${data.documents?.length || 0} verified document(s) to the matter vault.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save demand letter");
    } finally {
      setActionBusy("");
    }
  }

  function printPreview() {
    if (!preview?.html) return;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    win.document.write(preview.html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  }

  if (!token) {
    return <div className="admin-card"><div className="admin-body"><h2>Document Studio</h2><p className="muted">Sign in to Chambers administration before opening this workspace.</p></div></div>;
  }

  return (
    <div className="admin-card">
      <header className="admin-head">
        <div><strong>Chambers Document Studio</strong><div style={{fontSize:12,opacity:.75}}>Verify first • Render from approved letterhead • Audit every calculation</div></div>
        <a className="button button-light button-small" href="/chambers-admin/recovery">Recovery Workspace</a>
      </header>
      <div className="admin-body">
        {message && <p className="notice">{message}</p>}
        <div className="content-grid" style={{alignItems:"start"}}>
          <form className="content-card" onSubmit={submit}>
            <div className="eyebrow">Verified demand</div>
            <h2 style={{fontSize:"2rem",marginTop:6}}>Prepare formal demand letter</h2>
            <p className="muted">The letter remains blocked until the claimed outstanding agrees with the independent calculation.</p>
            <Section title="Client & references">
              <Field label="Client name"><input name="client_name" defaultValue="Batlokoa Financial Services" required /></Field>
              <Field label="Client reference"><input name="client_reference" /></Field>
              <Field label="Chambers reference"><input name="chambers_reference" placeholder="LC/BATL/B1406/270926" required /></Field>
              <Field label="Source / loan reference"><input name="source_reference" required /></Field>
            </Section>
            <Section title="Debtor">
              <Field label="Debtor full name"><input name="debtor_name" required /></Field>
              <Field label="National ID"><input name="national_id" required /></Field>
              <Field label="Address"><textarea name="debtor_address" rows={3} /></Field>
            </Section>
            <Section title="Debt calculation">
              <Field label="Loan date"><input type="date" name="loan_date" required /></Field>
              <Field label="Principal"><input type="number" name="principal" step="0.01" min="0.01" required /></Field>
              <Field label="Contractual rate %"><input type="number" name="rate" step="0.0001" min="0" required /></Field>
              <Field label="Term months"><input type="number" name="term_months" min="1" required /></Field>
              <Field label="Calculation method"><select name="method" defaultValue="micro_loan">{methods.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Processing fee"><input type="number" name="processing_fee" step="0.01" min="0" defaultValue="0" /></Field>
              <Field label="Payments credited"><input type="number" name="payment_amount" step="0.01" min="0" defaultValue="0" /></Field>
              <Field label="Payment date"><input type="date" name="payment_date" /></Field>
              <Field label="Payment reference"><input name="payment_reference" /></Field>
              <Field label="Claimed outstanding"><input type="number" name="claimed_outstanding" step="0.01" min="0" required /></Field>
              <Field label="Verify as at"><input type="date" name="as_of_date" required /></Field>
            </Section>
            <Section title="Demand settings">
              <Field label="Letter date"><input type="date" name="letter_date" required /></Field>
              <Field label="Demand period (days)"><input type="number" name="demand_days" min="1" max="90" defaultValue="7" required /></Field>
              <Field label="Payment instructions"><textarea name="payment_instructions" rows={3} /></Field>
              <Field label="Additional notice"><textarea name="additional_notice" rows={3} /></Field>
              <Field label="Signatory"><input name="signatory_name" defaultValue="Advocate Mats'epe Lelefa, LLM" required /></Field>
              <Field label="Title"><input name="signatory_title" defaultValue="Managing Partner" required /></Field>
            </Section>
            <button className="button" disabled={busy} aria-busy={busy}>{busy ? "Verifying…" : "Verify debt & prepare letter"}</button>
          </form>

          <div className="content-card" style={{position:"sticky",top:90}}>
            <div className="eyebrow">Verification result</div>
            {!preview && <><h2 style={{fontSize:"1.8rem"}}>No draft yet</h2><p className="muted">Complete the form to independently recalculate the debt before the formal demand is rendered.</p></>}
            {preview && <>
              <h2 style={{fontSize:"1.8rem"}}>{preview.eligible ? "Verified — ready to render" : "Blocked — review required"}</h2>
              {preview.blockers.length > 0 && <div className="notice"><strong>Generation blocked</strong><ul>{preview.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div>}
              {preview.warnings.length > 0 && <div className="notice"><strong>Warnings</strong><ul>{preview.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div>}
              <dl style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"10px 20px",margin:"24px 0"}}>
                {Object.entries(preview.amount_summary).map(([key,value]) => <div key={key} style={{display:"contents"}}><dt style={{textTransform:"capitalize"}}>{key.replaceAll("_"," ")}</dt><dd style={{fontWeight:700,margin:0}}>{value}</dd></div>)}
              </dl>
              <p><strong>Deadline:</strong> {preview.deadline}</p>
              {verificationHash && <p className="muted" style={{fontSize:11,overflowWrap:"anywhere"}}>Verification hash: {verificationHash}</p>}

              <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"18px 0"}}>
                <button type="button" className="button" disabled={!preview.eligible || actionBusy !== ""} onClick={() => download("pdf")}>{actionBusy === "pdf" ? "Generating PDF…" : "Download PDF"}</button>
                <button type="button" className="button button-light" disabled={!preview.eligible || actionBusy !== ""} onClick={() => download("docx")}>{actionBusy === "docx" ? "Generating DOCX…" : "Download DOCX"}</button>
                <button type="button" className="button button-light" disabled={!preview.eligible || !preview.html || actionBusy !== ""} onClick={printPreview}>Print preview</button>
              </div>

              <div style={{borderTop:"1px solid #ddd",paddingTop:16,marginTop:16}}>
                <strong>Save verified letter to matter</strong>
                <p className="muted" style={{fontSize:12}}>Both the editable DOCX and signed-ready PDF are stored in the private legal document vault with checksums and the verification hash.</p>
                <Field label="Matter"><select value={matterId} onChange={(event) => setMatterId(event.target.value)}><option value="">Select matter…</option>{matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.matter_reference || `Matter ${matter.id}`} — {matter.title || "Untitled matter"}</option>)}</select></Field>
                <button type="button" className="button" disabled={!preview.eligible || !matterId || actionBusy !== ""} onClick={saveToMatter}>{actionBusy === "vault" ? "Saving to vault…" : "Save DOCX + PDF to matter"}</button>
              </div>

              {preview.html && <iframe title="Demand letter preview" srcDoc={preview.html} style={{width:"100%",height:620,border:"1px solid #ddd",marginTop:20,background:"white"}} />}
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({title,children}:{title:string;children:React.ReactNode}) {
  return <fieldset style={{border:0,padding:0,margin:"26px 0"}}><legend style={{fontWeight:700,marginBottom:12}}>{title}</legend>{children}</fieldset>;
}

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label style={{display:"grid",gap:6,marginBottom:12}}><span style={{fontSize:13,fontWeight:600}}>{label}</span>{children}</label>;
}
