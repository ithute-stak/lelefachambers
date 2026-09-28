"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import styles from "./document-studio.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type ScheduleRow = {
  period: number;
  opening_balance: string;
  interest: string;
  principal_component: string;
  instalment: string;
  closing_balance: string;
};

type Snapshot = {
  inputs_hash: string;
  method: string;
  principal: string;
  contractual_interest: string;
  processing_fee: string;
  total_repayable: string;
  payments_credited: string;
  verified_outstanding: string;
  standard_instalment: string;
  term_months: number;
  annual_rate_percent: string;
  schedule: ScheduleRow[];
};

type Preview = {
  eligible: boolean;
  blockers: string[];
  warnings: string[];
  subject: string;
  deadline: string;
  amount_summary: Record<string, string>;
  html: string | null;
  verification: {
    claimed_outstanding?: string | null;
    variance?: string | null;
    snapshot: Snapshot;
  };
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
] as const;

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(value: unknown): string {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "M 0.00";
  return `M ${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function methodLabel(value: unknown): string {
  return methods.find(([key]) => key === value)?.[1] || String(value || "Not selected");
}

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
  const snapshot = preview?.verification?.snapshot;
  const claimedOutstanding = payload?.verification?.claimed_outstanding;

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
    return (
      <div className={styles.studioPage}>
        <div className={styles.panel}>
          <div className={styles.panelBody}>
            <h2>Document Studio</h2>
            <p>Sign in to Chambers administration before opening this workspace.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.studioPage}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>Verified legal documents</div>
          <h1>One workspace for debt verification and formal demands</h1>
          <p>Reconstruct the debt independently, compare the client claim, inspect the repayment calculation and generate the approved Chambers letter only after verification passes.</p>
        </div>
        <div className={styles.heroActions}>
          <a className={styles.secondaryButton} href="/chambers-admin/recovery">Recovery workspace</a>
          <button className={styles.primaryButton} form="demand-studio-form" type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Verify debt"}
          </button>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Document Studio summary">
        <Metric label="Contractual total" value={snapshot ? money(snapshot.total_repayable) : "—"} hint="Independent calculation" />
        <Metric label="Payments credited" value={snapshot ? money(snapshot.payments_credited) : "—"} hint="Applied before demand" />
        <Metric label="Client claim" value={payload ? money(claimedOutstanding) : "—"} hint="Amount supplied by client" />
        <Metric
          label="Demand status"
          value={!preview ? "Awaiting verification" : preview.eligible ? "Verified" : "Blocked"}
          hint={preview?.eligible ? `Verified outstanding ${money(snapshot?.verified_outstanding)}` : preview ? "Review the calculation variance" : "Complete the account inputs"}
          status={preview ? (preview.eligible ? "good" : "bad") : undefined}
        />
      </section>

      <div className={styles.workspaceNav} aria-hidden="true">
        <span className={styles.activeNav}>Debt verification</span>
        <span>Calculation result</span>
        <span>Approved letter preview</span>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      <div className={styles.workspaceGrid}>
        <form id="demand-studio-form" className={styles.panel} onSubmit={submit}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Account inputs</h2>
              <p>Client, debtor, contractual and payment information.</p>
            </div>
            <span className={styles.resultHeaderStatus}>Verification source</span>
          </header>
          <div className={styles.panelBody}>
            <Section title="Client & references">
              <Field label="Client name"><input name="client_name" defaultValue="Batlokoa Financial Services" required /></Field>
              <Field label="Client reference"><input name="client_reference" /></Field>
              <Field label="Chambers reference"><input name="chambers_reference" placeholder="LC/BATL/B1406/270926" required /></Field>
              <Field label="Source / loan reference"><input name="source_reference" required /></Field>
            </Section>

            <Section title="Debtor">
              <Field label="Debtor full name"><input name="debtor_name" required /></Field>
              <Field label="National ID"><input name="national_id" required /></Field>
              <Field label="Address" full><textarea name="debtor_address" rows={3} /></Field>
            </Section>

            <Section title="Debt calculation">
              <Field label="Loan date"><input type="date" name="loan_date" required /></Field>
              <Field label="Principal"><input type="number" name="principal" step="0.01" min="0.01" required /></Field>
              <Field label="Contractual rate %"><input type="number" name="rate" step="0.0001" min="0" required /></Field>
              <Field label="Term months"><input type="number" name="term_months" min="1" required /></Field>
              <Field label="Calculation method" full>
                <select name="method" defaultValue="micro_loan">{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              </Field>
              <Field label="Processing fee"><input type="number" name="processing_fee" step="0.01" min="0" defaultValue="0" /></Field>
              <Field label="Claimed outstanding"><input type="number" name="claimed_outstanding" step="0.01" min="0" required /></Field>
              <Field label="Payments credited"><input type="number" name="payment_amount" step="0.01" min="0" defaultValue="0" /></Field>
              <Field label="Payment date"><input type="date" name="payment_date" /></Field>
              <Field label="Payment reference"><input name="payment_reference" /></Field>
              <Field label="Verify as at"><input type="date" name="as_of_date" defaultValue={todayInput()} required /></Field>
            </Section>

            <Section title="Demand settings">
              <Field label="Letter date"><input type="date" name="letter_date" defaultValue={todayInput()} required /></Field>
              <Field label="Demand period (days)"><input type="number" name="demand_days" min="1" max="90" defaultValue="7" required /></Field>
              <Field label="Payment instructions" full><textarea name="payment_instructions" rows={3} /></Field>
              <Field label="Additional notice" full><textarea name="additional_notice" rows={3} /></Field>
              <Field label="Signatory"><input name="signatory_name" defaultValue="Advocate Mats'epe Lelefa, LLM" required /></Field>
              <Field label="Title"><input name="signatory_title" defaultValue="Managing Partner" required /></Field>
            </Section>

            <div className={styles.formFooter}>
              <div className={styles.formFootnote}>Formal generation stays locked until the independently verified balance agrees with the client claim.</div>
              <button className={styles.primaryButton} disabled={busy} aria-busy={busy}>{busy ? "Verifying account…" : "Verify & prepare demand"}</button>
            </div>
          </div>
        </form>

        <section className={`${styles.panel} ${styles.resultPanel}`}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Calculation result</h2>
              <p>LoanHub-aligned reconstruction with legal demand eligibility.</p>
            </div>
            <span className={`${styles.resultHeaderStatus} ${preview ? (preview.eligible ? styles.goodBadge : styles.badBadge) : ""}`}>
              {!preview ? "Not verified" : preview.eligible ? "Verified" : "Blocked"}
            </span>
          </header>

          {!preview ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateInner}>
                <div className={styles.emptyIcon}>✓</div>
                <h3>Ready for independent verification</h3>
                <p>Complete the account inputs on the left. Chambers will calculate the contractual amount, credit payments, compare the client claim and show the full repayment schedule here.</p>
              </div>
            </div>
          ) : (
            <div className={styles.panelBody}>
              <div className={styles.resultMetrics}>
                <ResultMetric label="Principal" value={money(snapshot?.principal)} />
                <ResultMetric label="Total interest" value={money(snapshot?.contractual_interest)} />
                <ResultMetric label="Total repayable" value={money(snapshot?.total_repayable)} />
                <ResultMetric label="Verified outstanding" value={money(snapshot?.verified_outstanding)} />
              </div>

              <div className={styles.methodStrip}>
                <span><strong>{methodLabel(snapshot?.method || payload?.verification?.method)}</strong><br />{snapshot?.term_months || payload?.verification?.term_months} month contractual calculation</span>
                <span><strong>Demand deadline</strong><br />{preview.deadline}</span>
              </div>

              {preview.blockers.length > 0 && (
                <div className={styles.notice}><strong>Generation blocked</strong><ul>{preview.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div>
              )}
              {preview.warnings.length > 0 && (
                <div className={styles.warning}><strong>Verification warnings</strong><ul>{preview.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div>
              )}

              <div className={styles.scheduleWrap}>
                <table className={styles.schedule}>
                  <thead>
                    <tr><th>Period</th><th>Opening</th><th>Principal</th><th>Interest</th><th>Instalment</th><th>Closing</th></tr>
                  </thead>
                  <tbody>
                    {(snapshot?.schedule || []).map((row) => (
                      <tr key={row.period}>
                        <td>{row.period}</td>
                        <td>{money(row.opening_balance)}</td>
                        <td>{money(row.principal_component)}</td>
                        <td>{money(row.interest)}</td>
                        <td><strong>{money(row.instalment)}</strong></td>
                        <td>{money(row.closing_balance)}</td>
                      </tr>
                    ))}
                    {(snapshot?.schedule || []).length === 0 && <tr><td colSpan={6}>No schedule returned for this calculation.</td></tr>}
                  </tbody>
                </table>
              </div>

              {verificationHash && <p style={{fontSize:10,color:"#82909a",overflowWrap:"anywhere",margin:"10px 0 0"}}>Verification hash: {verificationHash}</p>}

              <div className={styles.resultActions}>
                <button type="button" className={styles.primaryButton} disabled={!preview.eligible || actionBusy !== ""} onClick={() => download("pdf")}>{actionBusy === "pdf" ? "Generating PDF…" : "Download PDF"}</button>
                <button type="button" className={styles.secondaryButton} disabled={!preview.eligible || actionBusy !== ""} onClick={() => download("docx")}>{actionBusy === "docx" ? "Generating DOCX…" : "Download DOCX"}</button>
                <button type="button" className={styles.ghostButton} disabled={!preview.eligible || !preview.html || actionBusy !== ""} onClick={printPreview}>Print preview</button>
              </div>

              <div className={styles.vaultRow}>
                <Field label="Save verified letter to matter">
                  <select value={matterId} onChange={(event) => setMatterId(event.target.value)}>
                    <option value="">Select matter…</option>
                    {matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.matter_reference || `Matter ${matter.id}`} — {matter.title || "Untitled matter"}</option>)}
                  </select>
                </Field>
                <button type="button" className={styles.secondaryButton} disabled={!preview.eligible || !matterId || actionBusy !== ""} onClick={saveToMatter}>{actionBusy === "vault" ? "Saving…" : "Save DOCX + PDF"}</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {preview?.html && (
        <section className={`${styles.panel} ${styles.previewPanel}`}>
          <div className={styles.previewToolbar}>
            <div><h2>Approved letter preview</h2><p>Rendered from the supplied Lelefa Chambers template with its approved header and footer.</p></div>
            <div className={styles.resultActions} style={{marginTop:0}}>
              <button type="button" className={styles.ghostButton} onClick={printPreview}>Print</button>
              <button type="button" className={styles.primaryButton} disabled={!preview.eligible || actionBusy !== ""} onClick={() => download("pdf")}>PDF</button>
            </div>
          </div>
          <iframe title="Demand letter preview" srcDoc={preview.html} className={styles.previewFrame} />
        </section>
      )}
    </div>
  );
}

function Metric({ label, value, hint, status }: { label: string; value: string; hint: string; status?: "good" | "bad" }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={`${styles.metricValue} ${status === "good" ? styles.statusGood : status === "bad" ? styles.statusBad : ""}`}>{value}</div>
      <div className={styles.metricHint}>{hint}</div>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return <div className={styles.resultMetric}><span>{label}</span><strong>{value}</strong></div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className={styles.formSection}>
      <legend className={styles.sectionTitle}>{title}</legend>
      <div className={styles.formGrid}>{children}</div>
    </fieldset>
  );
}

function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) {
  return <label className={`${styles.field} ${full ? styles.fullField : ""}`}><span>{label}</span>{children}</label>;
}
