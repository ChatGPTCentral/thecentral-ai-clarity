import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getFacts } from "@/lib/factsStore";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "Ask the desk" — answer a question grounded in the selected day's facts. */
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

  const facts = await getFacts(date);
  if (!facts) return NextResponse.json({ error: "No data for that date" }, { status: 404 });

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system:
        "You are the analyst desk for thecentral.ai's Daily Brief. Answer the user's question " +
        "using ONLY the JSON facts below (yesterday's traffic, pages, search keywords, behavior, " +
        "events and revenue). Be concise and specific, cite the exact numbers you use, and if the " +
        "data doesn't contain the answer say so plainly. Metrics with a `prev` field are day-over-" +
        "day (value vs the day before). House style: use '- -' instead of em dashes, no terminal " +
        "periods on short lines, sentence case, no emoji.\n\n=== FACTS (" +
        date +
        ") ===\n" +
        JSON.stringify(facts).slice(0, 120_000),
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
