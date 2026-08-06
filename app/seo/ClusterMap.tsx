import type { Cluster } from "@/lib/seo";

const STAGE_FILL: Record<string, string> = {
  BOFU: "#B0563C",
  MOFU: "#E4C77A",
  TOFU: "#AACDEA",
  Mixed: "#B8B0A0",
};

/** Deterministic topic-network map: the site at the center, topic clusters as
 * hubs (sized by impressions, coloured by funnel stage), each with a few
 * keyword satellites. Pure SVG - - no client JS or external libraries. */
export default function ClusterMap({ clusters }: { clusters: Cluster[] }) {
  const items = clusters.slice(0, 9);
  if (!items.length) return null;

  const W = 920;
  const H = 620;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 330;
  const ry = 215;
  const maxImpr = Math.max(...items.map((c) => c.impressions), 1);
  const nodeR = (impr: number) => 16 + 40 * Math.sqrt(impr / maxImpr);

  const nodes = items.map((c, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / items.length;
    return {
      c,
      x: cx + rx * Math.cos(ang),
      y: cy + ry * Math.sin(ang),
      r: nodeR(c.impressions),
      ang,
    };
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxWidth: 960, fontFamily: "var(--mono)" }}
        role="img"
        aria-label="Topic cluster network"
      >
        {/* edges: centre -> hub */}
        {nodes.map((n, i) => (
          <line
            key={`e${i}`}
            x1={cx}
            y1={cy}
            x2={n.x}
            y2={n.y}
            stroke="#2A2A2A"
            strokeOpacity={0.28}
            strokeWidth={1 + 3.5 * (n.c.impressions / maxImpr)}
          />
        ))}

        {/* keyword satellites */}
        {nodes.map((n, i) => {
          const kw = n.c.top.slice(0, Math.min(5, n.c.size));
          const outward = n.ang; // push satellites away from centre
          return kw.map((_, k) => {
            const sa = outward + (k - (kw.length - 1) / 2) * 0.5;
            const sr = n.r + 30;
            const sx = n.x + sr * Math.cos(sa);
            const sy = n.y + sr * Math.sin(sa);
            return (
              <g key={`s${i}-${k}`}>
                <line x1={n.x} y1={n.y} x2={sx} y2={sy} stroke="#8A8478" strokeOpacity={0.5} strokeWidth={0.8} />
                <circle cx={sx} cy={sy} r={3} fill="#8A8478" />
              </g>
            );
          });
        })}

        {/* hubs */}
        {nodes.map((n, i) => {
          const right = n.x >= cx;
          const label = n.c.name.length > 22 ? n.c.name.slice(0, 21) + "…" : n.c.name;
          const trend =
            n.c.trend == null ? "" : `${n.c.trend > 0 ? "▲" : "▼"}${Math.abs(n.c.trend * 100).toFixed(0)}%`;
          return (
            <g key={`h${i}`}>
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r}
                fill={STAGE_FILL[n.c.stage] ?? STAGE_FILL.Mixed}
                stroke="#2A2A2A"
                strokeWidth={1.5}
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fill="#1A1A1A"
              >
                {Math.round(n.c.impressions).toLocaleString()}
              </text>
              <text
                x={right ? n.x + n.r + 8 : n.x - n.r - 8}
                y={n.y - 2}
                textAnchor={right ? "start" : "end"}
                fontSize={13}
                fontWeight={700}
                fill="#1A1A1A"
              >
                {label}
              </text>
              <text
                x={right ? n.x + n.r + 8 : n.x - n.r - 8}
                y={n.y + 13}
                textAnchor={right ? "start" : "end"}
                fontSize={10.5}
                fill="#4A4A4A"
              >
                {n.c.size} kw {trend && `· ${trend}`}
              </text>
            </g>
          );
        })}

        {/* centre = the site */}
        <circle cx={cx} cy={cy} r={30} fill="#1A1A1A" stroke="#B0563C" strokeWidth={3} />
        <text x={cx} y={cy - 1} textAnchor="middle" fontSize={11} fontWeight={800} fill="#FFF6E7">
          the
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle" fontSize={11} fontWeight={800} fill="#FFF6E7">
          central
        </text>
      </svg>
    </div>
  );
}
