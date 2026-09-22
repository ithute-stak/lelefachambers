import { getSite } from "@/lib/api";

export default async function PracticeAreasPage() {
  const site = await getSite();
  return (
    <>
      <section className="page-hero">
        <div className="shell">
          <div className="eyebrow">Lelefa Chambers</div>
          <h1>Practice areas</h1>
          <p>Legal services managed as structured CMS content, allowing the Chambers to keep public capability descriptions current while preserving review and publication controls.</p>
        </div>
      </section>
      <section className="section">
        <div className="shell">
          <div className="cards">
            {site.practice_areas.map((practice, index) => (
              <article className="card" id={practice.slug} key={practice.id}>
                <span className="card-number">{String(index + 1).padStart(2, "0")}</span>
                <h3>{practice.name}</h3>
                <p>{practice.body || practice.short_description}</p>
                <div className="tag-list">
                  {practice.audience.map((audience) => <span className="tag" key={audience}>{audience}</span>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
