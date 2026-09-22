import Link from "next/link";
import { getSite } from "@/lib/api";

const fallbackPractices = [
  ["Banking & Financial Law", "Regulatory, compliance and financial-sector legal support."],
  ["Debt Recovery", "Structured legal recovery from demand through lawful enforcement."],
  ["Litigation", "Preparation and representation in civil and commercial disputes."],
  ["Corporate Advisory", "Contracts, governance and commercial legal support."],
  ["Compliance", "Regulatory risk, governance and policy advisory."],
  ["Mediation & Negotiation", "Practical dispute resolution and negotiated settlement support."]
];

const practiceMarks = ["§", "↗", "⚖", "▦", "✓", "◇"];

export default async function HomePage() {
  const site = await getSite();
  const home = site.pages.find((page) => page.slug === "home");
  const practices = site.practice_areas.filter((item) => item.featured).slice(0, 6);
  const professional = site.professionals.find((item) => item.featured) || site.professionals[0];
  const articles = site.articles.slice(0, 3);

  return (
    <>
      <section className="hero-premium">
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="shell hero-premium-grid">
          <div className="hero-copy">
            <div className="eyebrow eyebrow-light">Experience <span>/</span> Integrity <span>/</span> Results</div>
            <h1>{home?.hero_title || <>Legal expertise for a <em>brighter tomorrow.</em></>}</h1>
            <p>{home?.hero_body || "Trusted, practical legal solutions for individuals, businesses and financial institutions across Lesotho."}</p>
            <div className="hero-actions">
              <Link className="button button-gold" href="/contact">Request consultation <span>→</span></Link>
              <Link className="button button-outline" href="/practice-areas">Explore our services</Link>
            </div>
            <div className="trust-row">
              <div><span className="trust-icon">⚖</span><strong>Trusted legal counsel</strong><small>Prepared, controlled legal work</small></div>
              <div><span className="trust-icon">◆</span><strong>Client-centred approach</strong><small>Clear advice around the matter</small></div>
              <div><span className="trust-icon">✓</span><strong>Practical solutions</strong><small>Actionable routes to resolution</small></div>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="mountain mountain-one" />
            <div className="mountain mountain-two" />
            <div className="justice-card">
              <img src="/brand/lelefa-chambers-mark.png" alt="" />
              <div className="scales-art">
                <span className="scale-beam" />
                <span className="scale-left" />
                <span className="scale-right" />
              </div>
              <blockquote>“Law for a brighter tomorrow.”</blockquote>
              <small>Lelefa Chambers</small>
            </div>
            <div className="law-books">
              <span>JUSTICE</span>
              <span>INTEGRITY</span>
              <span>SERVICE</span>
            </div>
          </div>
        </div>
      </section>

      <section className="audience-strip">
        <div className="shell audience-grid">
          {[
            ["Individuals", "Personal legal support", "01"],
            ["Businesses", "Commercial legal solutions", "02"],
            ["Financial Institutions", "Specialised recovery and advisory", "03"],
            ["Dispute Resolution", "Litigation, mediation and negotiation", "04"]
          ].map(([title, body, number]) => (
            <Link href="/practice-areas" className="audience-card" key={title}>
              <span className="audience-number">{number}</span>
              <div><strong>{title}</strong><small>{body}</small></div>
              <b>→</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="section practice-section">
        <div className="shell">
          <div className="section-head modern-head">
            <div>
              <div className="eyebrow">Our practice areas</div>
              <h2>Specialised expertise. Clear legal direction.</h2>
            </div>
            <Link className="text-link" href="/practice-areas">View all practice areas <span>→</span></Link>
          </div>
          <div className="practice-grid">
            {(practices.length ? practices.map((practice) => [practice.name, practice.short_description, practice.slug]) : fallbackPractices.map((practice, index) => [practice[0], practice[1], `practice-${index}`])).map(([name, description, slug], index) => (
              <Link className="practice-card" href={practices.length ? `/practice-areas#${slug}` : "/practice-areas"} key={`${name}-${index}`}>
                <span className="practice-icon">{practiceMarks[index % practiceMarks.length]}</span>
                <div>
                  <h3>{name}</h3>
                  <p>{description}</p>
                </div>
                <span className="practice-arrow">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section about-premium">
        <div className="shell about-grid">
          <div className="about-visual">
            <div className="about-office-lines" />
            <img src="/brand/lelefa-chambers-logo.webp" alt="Lelefa Chambers" />
            <span>Law for a Brighter Tomorrow</span>
          </div>
          <div className="about-copy">
            <div className="eyebrow">About Lelefa Chambers</div>
            <h2>Committed to preparation, professional responsibility and impact.</h2>
            <p>Lelefa Chambers is a Lesotho-based legal practice focused on practical legal representation, dispute resolution, commercial advisory and controlled legal recovery. We combine professional legal judgment with disciplined matter management and clear client communication.</p>
            <div className="about-facts">
              <div><strong>Lesotho</strong><span>Local legal context</span></div>
              <div><strong>Litigation</strong><span>Dispute preparation</span></div>
              <div><strong>Recovery</strong><span>Controlled legal workflow</span></div>
              <div><strong>Advisory</strong><span>Commercial support</span></div>
            </div>
            <Link className="button button-gold" href="/about">Learn more about us <span>→</span></Link>
          </div>
        </div>
      </section>

      <section className="institutional-band">
        <div className="shell institutional-grid">
          <div>
            <div className="eyebrow eyebrow-light">Financial institutions & creditors</div>
            <h2>Legal recovery with control at every stage.</h2>
            <p>From instruction and legal review to demand, settlement, litigation, judgment and lawful execution, matters move through a documented professional workflow.</p>
            <Link className="button button-outline" href="/institutional-recovery">Explore institutional recovery <span>→</span></Link>
          </div>
          <div className="process-list">
            {[
              ["01", "Instruction & legal readiness"],
              ["02", "Demand & settlement pathway"],
              ["03", "Litigation & judgment"],
              ["04", "Execution & recovery reporting"]
            ].map(([number, label]) => (
              <div className="process-item" key={number}><span>{number}</span><strong>{label}</strong></div>
            ))}
          </div>
        </div>
      </section>

      {professional && (
        <section className="section leadership-section">
          <div className="shell leadership-grid">
            <div className="leadership-card">
              <div className="leadership-monogram">ML</div>
              <div>
                <span className="role-label">{professional.title}</span>
                <h3>{professional.full_name}</h3>
                <p>{professional.role}</p>
              </div>
            </div>
            <div className="leadership-copy">
              <div className="eyebrow">Professional leadership</div>
              <h2>Legal advice grounded in preparation and clear execution.</h2>
              <p>{professional.biography}</p>
              <div className="tag-list">{professional.practice_areas.map((area) => <span className="tag" key={area}>{area}</span>)}</div>
              <Link className="text-link" href="/our-team">Meet the Chambers <span>→</span></Link>
            </div>
          </div>
        </section>
      )}

      <section className="section insights-preview">
        <div className="shell">
          <div className="section-head modern-head">
            <div><div className="eyebrow">Legal knowledge</div><h2>Latest insights</h2></div>
            <Link className="text-link" href="/insights">View all insights <span>→</span></Link>
          </div>
          <div className="insight-grid">
            {articles.length ? articles.map((article) => (
              <article className="insight-card" key={article.id}>
                <div className="insight-art"><span>§</span></div>
                <div><small>{article.category}</small><h3>{article.title}</h3><p>{article.excerpt}</p></div>
              </article>
            )) : [
              ["Debt Recovery", "Preparing a matter for legal recovery"],
              ["Commercial Law", "Reducing legal risk through better contracts"],
              ["Compliance", "Building a practical compliance culture"]
            ].map(([category, title]) => (
              <article className="insight-card" key={title}>
                <div className="insight-art"><span>§</span></div>
                <div><small>{category}</small><h3>{title}</h3><p>Our knowledge centre will publish reviewed legal information and practical guidance from the Chambers.</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-cta-inner">
          <div><div className="eyebrow eyebrow-light">Start the conversation</div><h2>Practical legal advice starts with understanding the matter.</h2></div>
          <Link className="button button-gold" href="/contact">Request consultation <span>→</span></Link>
        </div>
      </section>
    </>
  );
}
