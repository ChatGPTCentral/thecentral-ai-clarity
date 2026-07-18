import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getReport } from "@/lib/reports";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "Ask the desk" — answer a question grounded in the selected day's report. */
export async function POST(req: Request): Promise<NextResponse> {
  let body: { question?: string; date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const question = (body.question ?? "").trim().slice(0, 500);
  const date = (body.date ?? "").trim();
  if (!question) return NextResponse.json({ error: "Ask a question" }, { status: 400 });
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  let report: string;
  try {
    report = await getReport(`clarity-reports/${date}.md`);
  } catch {
    return NextResponse.json({ error: "No report for that date" }, { status: 404 });
  }

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system:
        "You are the analyst desk for thecentral.ai's Conversion Intelligence brief. Answer the " +
        "user's question using ONLY the report below (its json dashboard block and markdown). Be " +
        "concise and specific, cite the numbers you use, and if the report doesn't contain the " +
        "answer say so plainly. House style: use '- -' instead of em dashes, no terminal periods " +
        "on short lines, sentence case, no emoji.\n\n=== REPORT ===\n" + report.slice(0, 120_000),
      messages: [{ role: "user", content: question }],
    });
    const answer = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return NextResponse.json({ answer });
  } catch (e) {
    console.error("Ask the desk failed:", e);
    return NextResponse.json({ error: "The desk could not answer just now" }, { status: 500 });
  }
}
