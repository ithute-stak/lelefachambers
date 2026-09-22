import Link from "next/link";
import { getSite } from "@/lib/api";

const knowledgeTopics = [
  ["Debt Recovery", "Preparing a matter for legal recovery", "What documents, instructions and account history help a legal team assess the next recovery step."],
  ["Commercial Law", "Building stronger contracts", "Practical contract principles that can reduce uncertainty and support better commercial relationships."],
  ["Litigation", "Understanding the litigation pathway", "A plain-language overview of preparation, pleadings, court process, judgment and post-judgment steps."],
  ["Compliance", "Turning compliance into an operating discipline", "How organisations can structure policies, evidence and accountability around regulatory obligations."],
  ["Negotiation", "Using settlement strategically", "When negotiated resolution can preserve time, cost and commercial relationships without losing legal control."],
  ["Financial Institutions", "Legal readiness for creditor matters", "How structured records and clear mandates support efficient legal review and recovery."],
];

export default async function InsightsPage() {
  const site = await getSite();
  const articles = site.articles;

  return (
    <>
      <section className="page-hero insights-hero">
        <div className="shell">
          <div className="eyebrow eyebrow-light">Legal knowledge</div>
          <h1>Insights & publications</h1>
          <p>Reviewed legal information, practical guidance and commentary for individuals, businesses, creditors and institutions in Lesotho.</p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head modern-head">
            <div>
              <div className="eyebrow">Knowledge centre</div>
              <h2>{articles.length ? "Latest from the Chambers" : "Topics our knowledge centre will cover"}</h2>
            </div>
            <Link className="button button-gold" href="/contact">Ask about a legal matter →</Link>
          </div>

          {articles.length ? (
            <div className="article-grid">
              {articles.map((article) => (
                <article className="article-card" key={article.id}>
                  <div className="insight-art"><span>§</span></div>
                  <small>{article.category}</small>
                  <h3>{article.title}</h3>
                  <p>{article.excerpt}</p>
                  {article.author_name && <p className="muted">By {article.author_name}</p>}
                </article>
              ))}
            </div>
          ) : (
            <>
              <div className="article-grid">
                {knowledgeTopics.map(([category, title, description]) => (
                  <article className="article-card" key={title}>
                    <div className="insight-art"><span>§</span></div>
                    <small>{category}</small>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </article>
                ))}
              </div>
              <div className="knowledge-note">
                <div>
                  <div className="eyebrow">Publishing workflow</div>
                  <h3>Articles are published only after internal review and approval.</h3>
                </div>
                <p>The Chambers administration portal supports draft, review and publication controls. Until approved articles are available, this page presents the subject areas the knowledge centre is designed to cover rather than showing an empty screen.</p>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-cta-inner">
          <div>
            <div className="eyebrow eyebrow-light">Need legal guidance?</div>
            <h2>Start with the facts of your matter.</h2>
          </div>
          <Link className="button button-gold" href="/contact">Request consultation →</Link>
        </div>
      </section>
    </>
  );
}
