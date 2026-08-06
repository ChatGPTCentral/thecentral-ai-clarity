import { beehiivConfigured } from "./sources/beehiiv";

/**
 * Content-coverage layer: reads what you've already published on beehiiv, so
 * the SEO desk knows your current content pillars and can label each demand
 * gap as covered / adjacent / new.
 */

export type Coverage = {
  posts: number;
  pillars: { name: string; count: number }[]; // your current content themes
  termFreq: Record<string, number>; // term -> number of published posts mentioning it
};

// Generic AI-domain words that don't distinguish a topic - - almost every post
// mentions them, so they can't tell "covered" from "new".
const GENERIC = new Set(
  ("ai tool tools app apps guide guides best free pdf download how use using make create build " +
    "review reviews online tips ways top list update news").split(" "),
);

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
  if (!posts.length) return { posts: 0, pillars: [], termFreq: {} };

  const docFreq = new Map<string, number>(); // # posts containing the term
  const bigramFreq = new Map<string, number>();
  for (const p of posts) {
    const toks = contentTokens(`${p.title ?? ""} ${p.subtitle ?? ""}`);
    for (const t of new Set(toks)) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
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

  const termFreq: Record<string, number> = {};
  for (const [t, c] of docFreq) termFreq[t] = c;

  return { posts: posts.length, pillars, termFreq };
}

/** How well existing content covers a topic, judged by its DISTINCTIVE terms
 * (its actual subject, not generic AI-domain words). */
export function classifyCoverage(
  queries: string[],
  termFreq: Record<string, number>,
): "covered" | "adjacent" | "new" {
  // Score tokens by how often they appear across this topic's queries, ignoring
  // generic domain words - - the top ones are the topic's real subject.
  const clusterFreq = new Map<string, number>();
  for (const q of queries) {
    for (const t of new Set(contentTokens(q))) {
      if (GENERIC.has(t)) continue;
      clusterFreq.set(t, (clusterFreq.get(t) ?? 0) + 1);
    }
  }
  const distinctive = [...clusterFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  if (!distinctive.length) return "adjacent"; // only generic terms -> broadly your domain

  const maxHits = Math.max(...distinctive.map((t) => termFreq[t] ?? 0));
  if (maxHits === 0) return "new";
  if (maxHits <= 4) return "adjacent";
  return "covered";
}
