"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Cluster } from "@/lib/seo";

const nf = (v: number) => Math.round(v).toLocaleString("en-US");

function Trend({ t }: { t: number | null }) {
  if (t == null) return <b className="ctrend new">new</b>;
  if (Math.abs(t) < 0.03) return <b className="ctrend flat">±0%</b>;
  const up = t > 0;
  return (
    <b className={`ctrend ${up ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {Math.abs(t * 100).toFixed(0)}%
    </b>
  );
}

export default function ClusterGrid({
  clusters,
  dismissed,
}: {
  clusters: Cluster[];
  dismissed: string[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(clusters);
  const [hidden, setHidden] = useState(dismissed);
  const [busy, setBusy] = useState(false);

  async function dismiss(name: string) {
    setItems((prev) => prev.filter((c) => c.name !== name));
    setHidden((prev) => [...prev, name]);
    setBusy(true);
    try {
      await fetch("/api/seo/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      router.refresh(); // re-sync the network map (server-rendered)
    } finally {
      setBusy(false);
    }
  }

  async function restore(name: string) {
    setHidden((prev) => prev.filter((n) => n !== name));
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

  if (!items.length && !hidden.length) {
    return <div className="empty">Not enough non-brand queries to cluster yet.</div>;
  }

  return (
    <>
      <div className="clgrid">
        {items.map((c, i) => (
          <div className="clcard" key={i}>
            <button
              className="cl-x"
              onClick={() => dismiss(c.name)}
              disabled={busy}
              title="Remove this cluster"
              aria-label={`Remove ${c.name}`}
            >
              ×
            </button>
            <div className="cl-top">
              <span className="cl-name" title={c.name}>
                {c.name}
              </span>
              <span className={`stage s-${c.stage.toLowerCase()}`}>{c.stage}</span>
            </div>
            <div className="cl-stats">
              <div>
                <b>{nf(c.impressions)}</b>
                <em>impr</em>
              </div>
              <div>
                <b>{c.size}</b>
                <em>keywords</em>
              </div>
              <div>
                <b>{c.avgPosition.toFixed(1)}</b>
                <em>avg pos</em>
              </div>
              <div>
                <Trend t={c.trend} />
                <em>vs prev 28d</em>
              </div>
            </div>
            <div className="cl-eg" title={c.top[0]?.query}>
              e.g. {c.top[0]?.query ?? "—"}
            </div>
          </div>
        ))}
      </div>

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
    </>
  );
}
