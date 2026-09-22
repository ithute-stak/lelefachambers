export type PageRecord = {
  id: number;
  slug: string;
  title: string;
  nav_label?: string | null;
  hero_title?: string | null;
  hero_body?: string | null;
  excerpt?: string | null;
  sections?: Array<Record<string, unknown>>;
  seo_title?: string | null;
  seo_description?: string | null;
  sort_order: number;
  show_in_navigation: boolean;
};

export type PracticeArea = {
  id: number;
  slug: string;
  name: string;
  short_description: string;
  body: string;
  audience: string[];
  featured: boolean;
  sort_order: number;
};

export type Professional = {
  id: number;
  slug: string;
  full_name: string;
  title: string;
  role?: string | null;
  biography: string;
  qualifications: string[];
  practice_areas: string[];
  admission_date?: string | null;
  image_url?: string | null;
  email?: string | null;
  featured: boolean;
};

export type Article = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  author_name?: string | null;
  image_url?: string | null;
  published_at?: string | null;
};

export type SiteData = {
  settings: Record<string, any>;
  pages: PageRecord[];
  practice_areas: PracticeArea[];
  professionals: Professional[];
  articles: Article[];
};

const serverApi = process.env.SERVER_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const FETCH_TIMEOUT_MS = 1800;

const fallback: SiteData = {
  settings: {
    brand: { name: "Lelefa Chambers", tagline: "Legal Strategy. Litigation. Recovery." },
    contact: {
      email: "info@lelefachambers.co.ls",
      phone: "+266 5776 3829",
      address: "Lenyora House, Office No. 4, 190 Nightingale Road, New Europa, Maseru, Lesotho"
    }
  },
  pages: [
    {
      id: 0,
      slug: "home",
      title: "Home",
      nav_label: "Home",
      hero_title: "Legal Strategy. Litigation. Recovery.",
      hero_body: "Disciplined legal representation, commercial dispute resolution and debt-recovery litigation for individuals, businesses and financial institutions across Lesotho.",
      sort_order: 0,
      show_in_navigation: true
    },
    { id: 1, slug: "about", title: "About", nav_label: "About", sort_order: 1, show_in_navigation: true },
    { id: 2, slug: "institutional-recovery", title: "Financial Institutions", nav_label: "Financial Institutions", sort_order: 4, show_in_navigation: true },
    { id: 3, slug: "contact", title: "Contact", nav_label: "Contact", sort_order: 6, show_in_navigation: true }
  ],
  practice_areas: [],
  professionals: [],
  articles: []
};

async function cmsFetch(path: string): Promise<Response> {
  return fetch(`${serverApi}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
}

export async function getSite(): Promise<SiteData> {
  try {
    const response = await cmsFetch("/api/v1/public/site");
    if (!response.ok) throw new Error(`CMS returned ${response.status}`);
    return await response.json();
  } catch {
    return fallback;
  }
}

export async function getPage(slug: string): Promise<PageRecord | null> {
  try {
    const response = await cmsFetch(`/api/v1/public/pages/${slug}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    const site = await getSite();
    return site.pages.find((page) => page.slug === slug) || null;
  }
}
