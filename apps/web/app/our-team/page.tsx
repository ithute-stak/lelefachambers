import { getSite } from "@/lib/api";

export default async function TeamPage() {
  const site = await getSite();
  return (
    <>
      <section className="page-hero">
        <div className="shell">
          <div className="eyebrow">Professional profiles</div>
          <h1>Our team</h1>
          <p>Public professional profiles are managed in the Chambers CMS, with qualifications, areas of practice and credentials kept separate from private legal records.</p>
        </div>
      </section>
      <section className="section">
        <div className="shell team-grid">
          {site.professionals.map((person) => (
            <article className="profile-card" key={person.id}>
              {person.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="profile-image" src={person.image_url} alt={person.full_name} style={{width:"100%",objectFit:"cover"}} />
              ) : <div className="profile-image">{person.full_name.split(" ").map((part) => part[0]).slice(0,2).join("")}</div>}
              <div className="profile-body">
                <div className="role">{person.title}</div>
                <h3>{person.full_name}</h3>
                {person.role && <p className="muted">{person.role}</p>}
                <p>{person.biography}</p>
                {person.admission_date && <p><strong>Admission:</strong> {person.admission_date}</p>}
                <div className="tag-list">
                  {person.practice_areas.map((area) => <span className="tag" key={area}>{area}</span>)}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
