import { beehiivConfigured } from "./sources/beehiiv";

/**
 * Content-coverage layer: reads what you've already published on beehiiv, so
 * the SEO desk knows your current content pillars and can label each demand
 * gap as covered / adjacent / new.
 */

export type Coverage = {
  posts: number;
  pillars: { name: string; count: number }[]; // your current content themes
  terms: string[]; // significant words across all published titles/subtitles
};

const STOP = new Set(
  ("a an the for to of and or in on is are be with your you my how what when which do does can i me " +
    "vs at as it this that from by best get free new now use using guide ways way tips top this these " +
    "into out about more most will").split(" "),
);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function contentTokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

interface Post {
  title?: string;
  subtitle?: string;
  status?: string;
}

async function fetchPosts(): Promise<Post[]> {
  const key = (process.env.BEEHIIV_API_KEY ?? "").trim();
  const pub = (process.env.BEEHIIV_PUBLICATION_ID ?? "").trim().replace(/^["']|["']$/g, "");
  const posts: Post[] = [];
  for (let page = 1; page <= 6; page++) {
    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${pub}/posts?status=confirmed&limit=100&page=${page}&order_by=publish_date&direction=desc`,
      { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!res.ok) break;
    const json = (await res.json()) as { data?: Post[]; total_pages?: number };
    posts.push(...(json.data ?? []));
    if (!json.data?.length || (json.total_pages && page >= json.total_pages)) break;
  }
  return posts;
}

/** Build the current content pillars + coverage vocabulary from published posts. */
export async function fetchCoverage(): Promise<Coverage | null> {
  if (!beehiivConfigured()) return null;
  let posts: Post[];
  try {
    posts = await fetchPosts();
  } catch {
    return null;
  }
  if (!posts.length) return { posts: 0, pillars: [], terms: [] };

  const termFreq = new Map<string, number>();
  const bigramFreq = new Map<string, number>();
  for (const p of posts) {
    const text = `${p.title ?? ""} ${p.subtitle ?? ""}`;
    const toks = contentTokens(text);
    for (const t of toks) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
    for (let i = 0; i < toks.length - 1; i++) {
      const g = `${toks[i]} ${toks[i + 1]}`;
      bigramFreq.set(g, (bigramFreq.get(g) ?? 0) + 1);
    }
  }

  const pillars = [...bigramFreq.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name: name.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAi\b/g, "AI"), count }));

  const terms = [...termFreq.entries()]
    .filter(([, c]) => c >= 1)
    .map(([t]) => t);

  return { posts: posts.length, pillars, terms };
}

/** How well existing content covers a set of queries: covered / adjacent / new. */
export function classifyCoverage(queries: string[], terms: string[]): "covered" | "adjacent" | "new" {
  const termSet = new Set(terms);
  const qtoks = new Set(queries.flatMap(contentTokens));
  if (!qtoks.size || !termSet.size) return "new";
  let hit = 0;
  for (const t of qtoks) if (termSet.has(t)) hit++;
  const frac = hit / qtoks.size;
  if (frac >= 0.4) return "covered";
  if (frac >= 0.12) return "adjacent";
  return "new";
}
