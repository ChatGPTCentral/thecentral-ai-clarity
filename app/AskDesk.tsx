"use client";

import { useState } from "react";

export default function AskDesk({ date }: { date: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, date }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "The desk could not answer");
      else setAnswer(data.answer);
    } catch {
      setError("Network error - - try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="askwrap">
      <div className="ask">
        <img src="/logo-avatar-dark.png" alt="" className="ask-avatar" />
        <div className="ask-field">
          <div className="ask-label">Ask the desk</div>
          <input
            className="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Why did upgrade scrolls drop this week?"
            disabled={loading}
          />
        </div>
        <button className="ask-btn" onClick={ask} disabled={loading}>
          {loading ? "Asking…" : "Ask ↵"}
        </button>
      </div>
      {error && <div className="ask-answer err">{error}</div>}
      {answer && <div className="ask-answer">{answer}</div>}
    </div>
  );
}
