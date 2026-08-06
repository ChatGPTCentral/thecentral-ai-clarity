import type { Segment } from "@/lib/seo";

const FILL: Record<string, string> = { TOFU: "#AACDEA", MOFU: "#E4C77A", BOFU: "#B0563C" };
const TEXT: Record<string, string> = { TOFU: "#1A1A1A", MOFU: "#1A1A1A", BOFU: "#FFF6E7" };

/** A funnel silhouette: three bands (top/middle/bottom) whose widths scale to
 * each stage's search demand. Pure SVG. */
export default function Funnel({
  tofu,
  mofu,
  bofu,
}: {
  tofu: Segment;
  mofu: Segment;
  bofu: Segment;
}) {
  const bands = [
    { key: "TOFU", label: "Top · awareness", seg: tofu },
    { key: "MOFU", label: "Middle · consideration", seg: mofu },
    { key: "BOFU", label: "Bottom · intent", seg: bofu },
  ];
  const W = 660;
  const cx = W / 2;
  const bh = 82;
  const gap = 8;
  const H = bands.length * bh + (bands.length - 1) * gap + 8;
  const maxImpr = Math.max(...bands.map((b) => b.seg.impressions), 1);
  const widthOf = (impr: number) => 150 + 420 * (impr / maxImpr);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 700, fontFamily: "var(--mono)" }}>
        {/* silhouette outline connecting band edges */}
        <polygon
          points={bands
            .map((b, i) => {
              const w = widthOf(b.seg.impressions);
              const y = i * (bh + gap) + bh / 2;
              return `${cx - w / 2},${y}`;
            })
            .concat(
              bands
                .slice()
                .reverse()
                .map((b, i) => {
                  const w = widthOf(b.seg.impressions);
                  const y = (bands.length - 1 - i) * (bh + gap) + bh / 2;
                  return `${cx + w / 2},${y}`;
                }),
            )
            .join(" ")}
          fill="#2A2A2A"
          fillOpacity={0.05}
        />
        {bands.map((b, i) => {
          const w = widthOf(b.seg.impressions);
          const y = i * (bh + gap);
          const x = cx - w / 2;
          return (
            <g key={b.key}>
              <rect x={x} y={y} width={w} height={bh} fill={FILL[b.key]} stroke="#2A2A2A" strokeWidth={1.3} />
              <text x={cx} y={y + 26} textAnchor="middle" fontSize={13} fontWeight={800} fill={TEXT[b.key]}>
                {b.label}
              </text>
              <text x={cx} y={y + 47} textAnchor="middle" fontSize={17} fontWeight={700} fill={TEXT[b.key]}>
                {Math.round(b.seg.impressions).toLocaleString()} impr
              </text>
              <text x={cx} y={y + 65} textAnchor="middle" fontSize={10.5} fill={TEXT[b.key]}>
                {b.seg.queries} keywords · {Math.round(b.seg.clicks)} clicks · pos{" "}
                {b.seg.avgPosition.toFixed(1)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
