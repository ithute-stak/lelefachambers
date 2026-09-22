import Link from "next/link";
import { getSite } from "@/lib/api";

export default async function HomePage() {
  const site = await getSite();
  const home = site.pages.find((page) => page.slug === "home");
  const practices = site.practice_areas.filter((item) => item.featured).slice(0, 6);
  const professional = site.professionals.find((item) => item.featured) || site.professionals[0];

  return (
    <>
      <section className="hero">
        <div className="shell hero-grid">
          <div>
            <div className="eyebrow">Lelefa Chambers • Maseru, Lesotho</div>
            <h1>{home?.hero_title || "Legal Strategy. Litigation. Recovery."}</h1>
            <p>{home?.hero_body || "Disciplined legal representation and debt-recovery litigation for individuals, businesses and financial institutions across Lesotho."}</p>
            <div className="hero-actions">
              <Link className="button button-light" href="/contact">Request a consultation</Link>
              <Link className="button button-secondary" href="/institutional-recovery">Institutional recovery</Link>
            </div>
          </div>
          <aside className="hero-panel">
            <div className="eyebrow">Core legal services</div>
            <h3>Counsel built around the matter, not a template.</h3>
            <ul>
              <li>Debt recovery & litigation</li>
              <li>Commercial disputes</li>
              <li>Corporate & commercial advisory</li>
              <li>Compliance & regulatory advisory</li>
              <li>Mediation & negotiation</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <div className="eyebrow">Practice areas</div>
              <h2>Legal capability with a clear route to action.</h2>
            </div>
            <p>Our public practice information is managed through the Chambers CMS, so services, professionals and institutional capabilities can be updated without rebuilding the website.</p>
          </div>
          <div className="cards">
            {practices.length > 0 ? practices.map((practice, index) => (
              <article className="card" key={practice.id}>
                <span className="card-number">0{index + 1}</span>
                <h3>{practice.name}</h3>
                <p>{practice.short_description}</p>
                <Link className="card-link" href={`/practice-areas#${practice.slug}`}>Explore service →</Link>
              </article>
            )) : [
              ["Debt Recovery & Litigation", "From demand and negotiated settlement through court proceedings, judgment and lawful execution."],
              ["Commercial Litigation", "Strategic preparation and representation in commercial disputes."],
              ["Corporate & Commercial", "Contracts, governance and commercial risk support."],
            ].map(([name, description], index) => (
              <article className="card" key={name}>
                <span className="card-number">0{index + 1}</span>
                <h3>{name}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-cream">
        <div className="shell split">
          <div className="statement">
            <div className="eyebrow">Financial institutions & creditors</div>
            <h2>From legal readiness to recovery, with control at every stage.</h2>
            <p>Lelefa Chambers can receive legally ready matters with structured collection history and supporting evidence, then manage demand, pleadings, litigation, negotiated settlement, judgment and lawful execution under the client mandate.</p>
            <div className="hero-actions">
              <Link className="button" href="/institutional-recovery">See the recovery model</Link>
            </div>
          </div>
          <div>
            <div className="metrics">
              <div className="metric"><strong>01</strong><span>Instruction & legal readiness</span></div>
              <div className="metric"><strong>02</strong><span>Demand & settlement pathway</span></div>
              <div className="metric"><strong>03</strong><span>Litigation & judgment</span></div>
              <div className="metric"><strong>04</strong><span>Execution & recovery reporting</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-dark">
        <div className="shell">
          <div className="section-head">
            <div>
              <div className="eyebrow">Recovery ecosystem</div>
              <h2>Legal work supported by an auditable recovery workflow.</h2>
            </div>
            <p>Lelefa Chambers performs professional legal services. Supporting recovery technology helps preserve matter history, deadlines, documents and client reporting without replacing legal judgment.</p>
          </div>
          <div className="timeline">
            {[
              ["01", "Instruction"], ["02", "Legal review"], ["03", "Demand / settlement"], ["04", "Court process"], ["05", "Recovery / closure"]
            ].map(([number, label]) => (
              <div className="timeline-step" key={number}>
                <small>{number}</small>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      {professional && (
        <section className="section">
          <div className="shell split">
            <div className="profile-card">
              <div className="profile-image">ML</div>
              <div className="profile-body">
                <div className="role">{professional.title}</div>
                <h3>{professional.full_name}</h3>
                <p className="muted">{professional.role}</p>
              </div>
            </div>
            <div className="statement">
              <div className="eyebrow">Professional leadership</div>
              <h2>Advice grounded in preparation, professional responsibility and clear execution.</h2>
              <p>{professional.biography}</p>
              <div className="tag-list">
                {professional.practice_areas.map((area) => <span className="tag" key={area}>{area}</span>)}
              </div>
              <div className="hero-actions"><Link className="button" href="/our-team">Meet the Chambers</Link></div>
            </div>
          </div>
        </section>
      )}

      <section className="section section-cream">
        <div className="shell statement">
          <div className="eyebrow">Speak to us</div>
          <h2>Start with enough information to understand the matter — not more than a public form needs.</h2>
          <p>Use the consultation form to give us your contact details, matter category and a short non-confidential summary. Sensitive documents can be handled through a controlled process after the initial review.</p>
          <div className="hero-actions"><Link className="button" href="/contact">Request consultation</Link></div>
        </div>
      </section>
    </>
  );
}
