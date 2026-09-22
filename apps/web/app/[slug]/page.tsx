import { notFound } from "next/navigation";
import Link from "next/link";
import { getPage } from "@/lib/api";

export default async function DynamicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();

  return (
    <>
      <section className="page-hero">
        <div className="shell">
          <div className="eyebrow">Lelefa Chambers</div>
          <h1>{page.hero_title || page.title}</h1>
          {(page.hero_body || page.excerpt) && <p>{page.hero_body || page.excerpt}</p>}
        </div>
      </section>
      <section className="section">
        <div className="shell">
          <div className="content-grid">
            <article className="content-card">
              <div className="eyebrow">{page.title}</div>
              {page.sections?.length ? page.sections.map((section, index) => (
                <section key={index} style={{marginTop:index ? 34 : 12}}>
                  {typeof section.title === "string" && <h2>{section.title}</h2>}
                  {typeof section.body === "string" && <p className="prose">{section.body}</p>}
                  {typeof section.text === "string" && <p className="prose">{section.text}</p>}
                  {typeof section.button === "string" && typeof section.href === "string" && (
                    <Link className="button" href={section.href}>{section.button}</Link>
                  )}
                </section>
              )) : (
                <p className="prose">{page.excerpt || page.hero_body || "This page is managed through the Lelefa Chambers content system."}</p>
              )}
            </article>
            <aside className="content-card">
              <div className="eyebrow">Need assistance?</div>
              <h2 style={{fontSize:"2rem"}}>Discuss the matter with the Chambers.</h2>
              <p className="prose">Start with a short non-confidential consultation request. We can then arrange the correct controlled channel for sensitive documents and legal instructions.</p>
              <Link className="button" href="/contact">Request consultation</Link>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
