import { get, put } from "@vercel/blob";

const KEY = "seo/dismissed-clusters.json";
const ACCESS = "private" as const;

async function readBlob(pathname: string): Promise<string | null> {
  const result = await get(pathname, { access: ACCESS, useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).text();
}

/** Names of clusters the user has dismissed from the SEO view. */
export async function getDismissed(): Promise<string[]> {
  try {
    const txt = await readBlob(KEY);
    if (!txt) return [];
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

async function save(names: string[]): Promise<void> {
  await put(KEY, JSON.stringify([...new Set(names)]), {
    access: ACCESS,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** Dismiss (default) or restore a cluster by name; returns the updated list. */
export async function toggleDismissed(name: string, restore = false): Promise<string[]> {
  const current = await getDismissed();
  const next = restore ? current.filter((n) => n !== name) : [...current, name];
  await save(next);
  return [...new Set(next)];
}
