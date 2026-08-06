import { NextResponse } from "next/server";
import { toggleDismissed } from "@/lib/seoDismiss";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  let body: { name?: string; restore?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Missing cluster name" }, { status: 400 });

  try {
    const dismissed = await toggleDismissed(name, Boolean(body.restore));
    return NextResponse.json({ dismissed });
  } catch (e) {
    console.error("Dismiss failed:", e);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
