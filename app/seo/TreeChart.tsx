"use client";

import { useMemo, useState } from "react";
import type { TreeNode } from "@/lib/seo";

const STAGE_FILL: Record<string, string> = {
  BOFU: "#B0563C",
  MOFU: "#E4C77A",
  TOFU: "#AACDEA",
  Mixed: "#B8B0A0",
};

const PAD = 26;
const COL = 210;
const ROW = 30;

function collectMax(node: TreeNode, acc: { m: number }) {
  if (node.kind !== "root") acc.m = Math.max(acc.m, node.impressions);
  node.children?.forEach((c) => collectMax(c, acc));
}

export default function TreeChart({ root }: { root: TreeNode }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["root"]));

  const maxImpr = useMemo(() => {
    const acc = { m: 1 };
    collectMax(root, acc);
    return acc.m;
  }, [root]);

  const layout = useMemo(() => {
    const y = new Map<string, number>();
    let leaf = 0;
    const walk = (node: TreeNode): number => {
      const kids = expanded.has(node.id) && node.children ? node.children : [];
      let yy: number;
      if (kids.length) {
        const ys = kids.map(walk);
        yy = (ys[0] + ys[ys.length - 1]) / 2;
      } else {
        yy = leaf++;
      }
      y.set(node.id, yy);
      return yy;
    };
    walk(root);

    const nodes: { node: TreeNode; depth: number; y: number }[] = [];
    const collect = (node: TreeNode, depth: number) => {
      nodes.push({ node, depth, y: y.get(node.id)! });
      if (expanded.has(node.id) && node.children) node.children.forEach((c) => collect(c, depth + 1));
    };
    collect(root, 0);

    const links: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const { node, depth } of nodes) {
      if (expanded.has(node.id) && node.children) {
        for (const c of node.children) {
          links.push({ x1: depth, y1: y.get(node.id)!, x2: depth + 1, y2: y.get(c.id)! });
        }
      }
    }
    const maxDepth = Math.max(...nodes.map((n) => n.depth));
    return { nodes, links, leaves: Math.max(leaf, 1), maxDepth };
  }, [root, expanded]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const px = (depth: number) => PAD + depth * COL + 30;
  const py = (yy: number) => PAD + yy * ROW + 14;
  const rOf = (node: TreeNode) =>
    node.kind === "root" ? 15 : Math.max(4, Math.min(22, 4 + 20 * Math.sqrt(node.impressions / maxImpr)));

  const width = PAD * 2 + layout.maxDepth * COL + 250;
  const height = PAD * 2 + layout.leaves * ROW + 10;

  return (
    <div style={{ overflow: "auto", maxHeight: 620, border: "1px solid var(--hair)" }}>
      <svg width={width} height={height} style={{ fontFamily: "var(--mono)", display: "block" }}>
        {layout.links.map((l, i) => {
          const x1 = px(l.x1);
          const y1 = py(l.y1);
          const x2 = px(l.x2);
          const y2 = py(l.y2);
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none"
              stroke="#2A2A2A"
              strokeOpacity={0.28}
              strokeWidth={1.2}
            />
          );
        })}

        {layout.nodes.map(({ node, depth, y }, i) => {
          const x = px(depth);
          const yy = py(y);
          const r = rOf(node);
          const hasKids = !!(node.children && node.children.length);
          const isOpen = expanded.has(node.id);
          const fill = node.kind === "root" ? "#1A1A1A" : STAGE_FILL[node.stage] ?? STAGE_FILL.Mixed;
          const label =
            node.name.length > 30 ? node.name.slice(0, 29) + "…" : node.name;
          const meta =
            node.kind === "keyword"
              ? `pos ${node.position?.toFixed(0)} · ${node.impressions.toLocaleString()}`
              : `${node.impressions.toLocaleString()} impr · ${node.size} kw${
                  node.trend != null ? ` · ${node.trend > 0 ? "▲" : "▼"}${Math.abs(node.trend * 100).toFixed(0)}%` : ""
                }`;
          return (
            <g
              key={node.id + i}
              style={{ cursor: hasKids ? "pointer" : "default" }}
              onClick={() => hasKids && toggle(node.id)}
            >
              <circle
                cx={x}
                cy={yy}
                r={r}
                fill={fill}
                stroke={node.kind === "root" ? "#B0563C" : "#2A2A2A"}
                strokeWidth={node.kind === "root" ? 3 : 1.3}
              />
              {hasKids && (
                <text x={x} y={yy + 3.5} textAnchor="middle" fontSize={11} fontWeight={800} fill={node.kind === "root" ? "#FFF6E7" : "#1A1A1A"}>
                  {isOpen ? "−" : "+"}
                </text>
              )}
              <text
                x={x + r + 7}
                y={yy - 1}
                fontSize={node.kind === "keyword" ? 11 : 12.5}
                fontWeight={node.kind === "keyword" ? 400 : 700}
                fill="#1A1A1A"
              >
                {label}
              </text>
              <text x={x + r + 7} y={yy + 11} fontSize={9.5} fill="#4A4A4A">
                {meta}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
