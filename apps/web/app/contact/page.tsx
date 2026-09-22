import { getSite } from "@/lib/api";
import ConsultationForm from "./ConsultationForm";

export default async function ContactPage() {
  const site = await getSite();
  const contact = site.settings.contact || {};
  return (
    <>
      <section className="page-hero">
        <div className="shell">
          <div className="eyebrow">Contact Lelefa Chambers</div>
          <h1>Start with a controlled first conversation.</h1>
          <p>Use the consultation request to give us only the minimum information needed to understand the nature of the matter and arrange the right next step.</p>
        </div>
      </section>
      <section className="section">
        <div className="shell contact-grid">
          <aside className="contact-panel">
            <div className="eyebrow">Chambers details</div>
            <h2 style={{fontFamily:"Georgia,serif",fontSize:"2.4rem",lineHeight:1.05}}>Lelefa Chambers</h2>
            <a href={`tel:${String(contact.phone || "+266 5776 3829").replace(/\s/g, "")}`}>{contact.phone || "+266 5776 3829"}</a>
            <a href={`mailto:${contact.email || "info@lelefachambers.co.ls"}`}>{contact.email || "info@lelefachambers.co.ls"}</a>
            <span>{contact.address || "Maseru, Lesotho"}</span>
            <p style={{marginTop:30,color:"#d7c9c4"}}>Submitting this form does not by itself create a lawyer-client relationship. The Chambers may need to perform a conflict check and confirm acceptance before acting.</p>
          </aside>
          <ConsultationForm />
        </div>
      </section>
    </>
  );
}
