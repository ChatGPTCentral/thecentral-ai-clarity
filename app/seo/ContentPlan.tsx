"use client";

import { useState } from "react";

interface Supporting {
  title: string;
  funnel: string;
  keywords: string[];
}
interface Pillar {
  topic: string;
  priority: string;
  coverage?: string;
  volume?: number;
  trendPct?: number | null;
  rationale: string;
  pillarPage: { title: string; angle: string; targetKeywords: string[] };
  supporting: Supporting[];
}

export default function ContentPlan() {
  const [pillars, setPillars] = useState<Pillar[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/content-plan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "The desk could not build a plan");
      else setPillars(data.pillars ?? []);
    } catch {
      setError("Network error - - try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {!pillars && (
        <button className="plan-btn" onClick={generate} disabled={loading}>
          {loading ? "Building the plan…" : "◆ Generate AI content plan"}
        </button>
      )}
      {error && <div className="ask-answer err" style={{ marginTop: 12 }}>{error}</div>}

      {pillars && (
        <>
          <div className="plan-head">
            <span>{pillars.length} pillar topics, prioritized</span>
            <button className="plan-btn small" onClick={generate} disabled={loading}>
              {loading ? "…" : "Regenerate"}
            </button>
          </div>
          <div className="plan-grid">
            {pillars.map((p, i) => (
              <div className="pillar" key={i}>
                <div className="pillar-top">
                  <span className={`prio p-${(p.priority || "").toLowerCase()}`}>{p.priority}</span>
                  {p.coverage && <span className={`cov cov-${p.coverage}`}>{p.coverage}</span>}
                  <span className="pillar-name">{p.topic}</span>
                </div>
                <div className="pillar-meta">
                  {p.volume != null && <span>{p.volume.toLocaleString()} impr</span>}
                  {p.trendPct != null && (
                    <span className={p.trendPct >= 0 ? "up" : "down"}>
                      {p.trendPct >= 0 ? "▲" : "▼"} {Math.abs(p.trendPct)}%
                    </span>
                  )}
                </div>
                <p className="pillar-why">{p.rationale}</p>

                <div className="pillar-page">
                  <div className="pp-label">Pillar page</div>
                  <div className="pp-title">{p.pillarPage.title}</div>
                  <div className="pp-angle">{p.pillarPage.angle}</div>
                  <div className="pp-kw">
                    {p.pillarPage.targetKeywords.map((k, j) => (
                      <span className="kw" key={j}>
                        {k}
                      </span>
                    ))}
                  </div>
                </div>

                {p.supporting?.length > 0 && (
                  <div className="pillar-support">
                    <div className="pp-label">Supporting articles</div>
                    {p.supporting.map((s, j) => (
                      <div className="support-row" key={j}>
                        <span className={`fn fn-${(s.funnel || "").toLowerCase()}`}>{s.funnel}</span>
                        <span className="support-title">{s.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
