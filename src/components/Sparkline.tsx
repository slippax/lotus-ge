/**
 * word-sized chart. no axes, no gridlines, endpoint emphasised.
 *
 * only drawn from real points - rows whose analysis keeps no history pass an
 * empty series and get an em dash. a blank cell reads as a bug, a dash reads as
 * "nothing recorded here".
 */
export default function Sparkline({
  series,
  width = 92,
  height = 26,
}: {
  series: number[];
  width?: number;
  height?: number;
}) {
  if (series.length < 2) {
    return (
      <span className="text-[15px] leading-none text-line-hi" aria-hidden="true">
        &mdash;
      </span>
    );
  }

  const n = series.length;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const x = (i: number) => (i / (n - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);

  const d = series
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const rising = series[n - 1] >= series[0];
  const stroke = rising ? "var(--up)" : "var(--down)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="block"
    >
      <path
        d={`${d} L${x(n - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`}
        fill={stroke}
        opacity="0.09"
      />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={x(n - 1).toFixed(1)}
        cy={y(series[n - 1]).toFixed(1)}
        r="2.6"
        fill={stroke}
      />
    </svg>
  );
}
