"use client";

import { FormEvent, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type State = { kind: "idle" | "loading" | "success" | "error"; message?: string };

export default function ConsultationForm() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "loading" });
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch(`${API}/api/v1/public/consultations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Unable to submit consultation request");
      event.currentTarget.reset();
      setState({ kind: "success", message: data.message || "Your consultation request has been received." });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Unable to submit your request." });
    }
  }

  return (
    <form className={`form-card ${state.kind === "loading" ? "loading" : ""}`} onSubmit={submit}>
      <div className="eyebrow">Consultation request</div>
      <h2 style={{fontFamily:"Georgia,serif",fontSize:"2rem",margin:"8px 0 12px"}}>Tell us how to contact you.</h2>
      <p className="notice">Please provide only a short non-confidential summary here. Do not upload privileged, highly sensitive or original evidence through this public enquiry form.</p>
      <div className="form-grid" style={{marginTop:20}}>
        <div className="field"><label htmlFor="full_name">Full name</label><input id="full_name" name="full_name" required /></div>
        <div className="field"><label htmlFor="phone">Telephone</label><input id="phone" name="phone" required /></div>
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required /></div>
        <div className="field"><label htmlFor="matter_type">Matter type</label><select id="matter_type" name="matter_type" required defaultValue=""><option value="" disabled>Select matter type</option><option>Debt Recovery & Litigation</option><option>Commercial Litigation</option><option>Corporate & Commercial</option><option>Compliance</option><option>Mediation & Negotiation</option><option>Employment</option><option>Other</option></select></div>
        <div className="field"><label htmlFor="preferred_date">Preferred date</label><input id="preferred_date" name="preferred_date" type="date" /></div>
        <div className="field"><label htmlFor="preferred_method">Preferred method</label><select id="preferred_method" name="preferred_method" defaultValue="Telephone"><option>Telephone</option><option>Email</option><option>In person</option><option>Video consultation</option></select></div>
        <div className="field field-full"><label htmlFor="summary">Short non-confidential summary</label><textarea id="summary" name="summary" rows={6} minLength={10} maxLength={3000} required /></div>
      </div>
      {state.kind === "success" && <p className="notice success">{state.message}</p>}
      {state.kind === "error" && <p className="notice error">{state.message}</p>}
      <button className="button" type="submit" disabled={state.kind === "loading"}>{state.kind === "loading" ? "Submitting…" : "Request consultation"}</button>
    </form>
  );
}
