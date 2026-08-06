"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TreeNode } from "@/lib/seo";

const nf = (v: number) => Math.round(v).toLocaleString("en-US");

function Trend({ t }: { t: number | null | undefined }) {
  if (t == null) return <span className="tl-trend new">new</span>;
  if (Math.abs(t) < 0.03) return <span className="tl-trend flat">±0%</span>;
  const up = t > 0;
  return (
    <span className={`tl-trend ${up ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {Math.abs(t * 100).toFixed(0)}%
    </span>
  );
}

function Stage({ s }: { s: string }) {
  return <span className={`stage s-${s.toLowerCase()}`}>{s}</span>;
}

export default function TopicList({
  root,
  coverage,
  dismissed,
}: {
  root: TreeNode;
  coverage?: Record<string, string>;
  dismissed: string[];
}) {
  const router = useRouter();
  const [sort, setSort] = useState<"impr" | "growth">("impr");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<string[]>(dismissed);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setOpen((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  async function dismiss(name: string) {
    setHidden((p) => [...p, name]);
    setBusy(true);
    try {
      await fetch("/api/seo/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  async function restore(name: string) {
    setHidden((p) => p.filter((n) => n !== name));
    setBusy(true);
    try {
      await fetch("/api/seo/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, restore: true }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const topics = (root.children ?? [])
    .filter((t) => !hidden.includes(t.name))
    .sort((a, b) =>
      sort === "impr"
        ? b.impressions - a.impressions
        : (b.trend ?? -Infinity) - (a.trend ?? -Infinity),
    );

  const max = Math.max(...topics.map((t) => t.impressions), 1);

  return (
    <div className="topiclist">
      <div className="tl-head">
        <span className="tl-sort-label">Sort</span>
        <button className={`tl-sort ${sort === "impr" ? "on" : ""}`} onClick={() => setSort("impr")}>
          Volume
        </button>
        <button className={`tl-sort ${sort === "growth" ? "on" : ""}`} onClick={() => setSort("growth")}>
          Growth
        </button>
      </div>

      {topics.map((t) => {
        const isOpen = open.has(t.id);
        const cov = coverage?.[t.name];
        const subs = (t.children ?? []).filter((c) => c.kind === "subtopic");
        const looseKw = (t.children ?? []).filter((c) => c.kind === "keyword");
        return (
          <div className="tl-topic" key={t.id}>
            <div className="tl-row" onClick={() => toggle(t.id)}>
              <span className="tl-caret">{isOpen ? "▾" : "▸"}</span>
              <span className="tl-bar" style={{ width: `${(t.impressions / max) * 100}%` }} />
              <span className="tl-name">{t.name}</span>
              {cov && <span className={`cov cov-${cov}`}>{cov}</span>}
              <Stage s={t.stage} />
              <span className="tl-metric">{nf(t.impressions)}</span>
              <span className="tl-metric dim">{t.size} kw</span>
              <Trend t={t.trend} />
              <button
                className="tl-x"
                title="Remove topic"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(t.name);
                }}
              >
                ×
              </button>
            </div>

            {isOpen && (
              <div className="tl-children">
                {subs.map((s) => {
                  const subOpen = open.has(s.id);
                  return (
                    <div key={s.id}>
                      <div className="tl-sub" onClick={() => toggle(s.id)}>
                        <span className="tl-caret">{subOpen ? "▾" : "▸"}</span>
                        <span className="tl-name">{s.name}</span>
                        <Stage s={s.stage} />
                        <span className="tl-metric">{nf(s.impressions)}</span>
                        <span className="tl-metric dim">{s.size} kw</span>
                        <Trend t={s.trend} />
                      </div>
                      {subOpen && (
                        <div className="tl-kws">
                          {(s.children ?? []).map((k) => (
                            <div className="tl-kw" key={k.id}>
                              <span className="tl-kwq" title={k.name}>
                                {k.name}
                              </span>
                              <span className="tl-metric dim">pos {k.position?.toFixed(0)}</span>
                              <span className="tl-metric">{nf(k.impressions)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {looseKw.length > 0 && (
                  <div className="tl-kws">
                    {looseKw.map((k) => (
                      <div className="tl-kw" key={k.id}>
                        <span className="tl-kwq" title={k.name}>
                          {k.name}
                        </span>
                        <span className="tl-metric dim">pos {k.position?.toFixed(0)}</span>
                        <span className="tl-metric">{nf(k.impressions)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {hidden.length > 0 && (
        <div className="dismissed-bar">
          <span className="dismissed-label">Hidden ({hidden.length}):</span>
          {hidden.map((name) => (
            <button key={name} className="restore-chip" onClick={() => restore(name)} disabled={busy}>
              {name} <span aria-hidden>↩</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
