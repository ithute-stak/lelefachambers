import { getSite } from "@/lib/api";

export default async function InsightsPage() {
  const site = await getSite();
  return (
    <>
      <section className="page-hero">
        <div className="shell">
          <div className="eyebrow">Legal knowledge</div>
          <h1>Insights & publications</h1>
          <p>Articles can move through draft, review and approval before publication, helping Lelefa Chambers publish useful legal information without bypassing internal oversight.</p>
        </div>
      </section>
      <section className="section">
        <div className="shell">
          {site.articles.length ? (
            <div className="article-grid">
              {site.articles.map((article) => (
                <article className="article-card" key={article.id}>
                  <small>{article.category}</small>
                  <h3>{article.title}</h3>
                  <p>{article.excerpt}</p>
                  {article.author_name && <p className="muted">By {article.author_name}</p>}
                </article>
              ))}
            </div>
          ) : (
            <div className="content-card">
              <div className="eyebrow">Publishing workflow ready</div>
              <h2>Legal insights will appear here when approved.</h2>
              <p className="prose">The CMS already supports article drafts, review status, publication status, authorship and SEO metadata. An authorised user can publish the first article from the Chambers administration portal.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
