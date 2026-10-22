"use client";
import { useId } from "react";
import { label, money, type Row } from "@/lib/client";
const colors = [
  "#285b45",
  "#708d62",
  "#b3c29d",
  "#193f30",
  "#9caa82",
  "#526e60",
];
export function ReportCharts({ report }: { report: Row }) {
  const uid = useId(),
    channels: Row[] = report.channels,
    methods: Row[] = report.methods,
    distribution: Row[] = report.distribution ?? [];
  const max = Math.max(1, ...channels.map((c) => Number(c.amount))),
    total = methods.reduce((s, c) => s + Number(c.amount), 0);
  const amounts = new Map(
    report.daily.map((d: Row) => [
      String(d.date).slice(0, 10),
      Number(d.amount),
    ]),
  );
  const daily: { date: string; amount: number }[] = [];
  for (
    let date = new Date(report.from + "T00:00:00Z"),
      end = new Date(report.to + "T00:00:00Z");
    date <= end;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const day = date.toISOString().slice(0, 10);
    daily.push({ date: day, amount: Number(amounts.get(day) ?? 0) });
  }
  const actualPeak = Math.max(0, ...daily.map((d) => d.amount)),
    peak = Math.max(1, actualPeak);
  const point = (i: number) => ({
    x: 24 + (daily.length === 1 ? 140 : (i * 280) / (daily.length - 1)),
    y: 160 - (daily[i].amount / peak) * 130,
  });
  let cumulative = 0;
  const stops = methods.map((m, index) => {
    const start = cumulative;
    cumulative += (Number(m.amount) / Math.max(total, 1)) * 100;
    return `${colors[index % colors.length]} ${start}% ${cumulative}%`;
  });
  const histogramPeak = Math.max(
    1,
    ...distribution.map((d) => Number(d.orders)),
  );
  return (
    <div className="report-chart-grid">
      <figure className="panel report-chart">
        <figcaption>Receipts by channel · bar chart</figcaption>
        {channels.length ? (
          <div className="report-bars">
            {channels.map((c) => (
              <div key={c.source}>
                <span>{label(c.source)}</span>
                <div>
                  <i style={{ width: (Number(c.amount) / max) * 100 + "%" }} />
                </div>
                <strong>{money(c.amount)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No settled receipts in this period.</p>
        )}
      </figure>
      <figure className="panel report-chart">
        <figcaption>Daily settled receipts · line chart</figcaption>
        <svg viewBox="0 0 330 200" role="img" aria-labelledby={uid + "-trend"}>
          <title id={uid + "-trend"}>
            Daily receipts from {report.from} to {report.to}; peak{" "}
            {money(actualPeak)}. Exact values appear in Daily sales below.
          </title>
          <line x1="24" x2="304" y1="160" y2="160" stroke="#b3c29d" />
          <text x="24" y="18" fontSize="10" fill="#526e60">
            {money(actualPeak)}
          </text>
          <polyline
            points={daily
              .map((_, i) => `${point(i).x},${point(i).y}`)
              .join(" ")}
            fill="none"
            stroke="#285b45"
            strokeWidth="2.5"
          />
          {daily.map((d, i) => (
            <circle
              key={d.date}
              cx={point(i).x}
              cy={point(i).y}
              r={daily.length < 40 ? 3 : 1.5}
              fill="#285b45"
            >
              <title>
                {d.date}: {money(d.amount)}
              </title>
            </circle>
          ))}
          <text x="24" y="185" fontSize="10" fill="#526e60">
            {report.from}
          </text>
          <text x="304" y="185" textAnchor="end" fontSize="10" fill="#526e60">
            {report.to}
          </text>
        </svg>
      </figure>
      <figure className="panel report-chart">
        <figcaption>Settled bill values · histogram</figcaption>
        <div
          className="report-histogram"
          role="img"
          aria-label="Number of final invoices in six equal-width rupee ranges"
        >
          {distribution.map((d, index) => (
            <div key={d.bucket}>
              <span>{d.orders}</span>
              <i
                style={{
                  height: (Number(d.orders) / histogramPeak) * 100 + "px",
                }}
              />
              <small>
                {money(d.lower)}
                <br />
                {index === distribution.length - 1 ? "to" : "to <"}{" "}
                {money(d.upper)}
              </small>
            </div>
          ))}
        </div>
        <small className="muted">
          Each bar counts issued final invoices. Ranges have equal width.
        </small>
      </figure>
      <figure className="panel report-chart">
        <figcaption>Received payments · share</figcaption>
        {total > 0 ? (
          <div className="payment-share">
            <div
              className="payment-pie"
              role="img"
              aria-label={methods
                .map(
                  (m) =>
                    label(m.method) +
                    ": " +
                    money(m.amount) +
                    " (" +
                    ((Number(m.amount) / total) * 100).toFixed(1) +
                    "%)",
                )
                .join(", ")}
              style={{ background: `conic-gradient(${stops.join(",")})` }}
            />
            <ul>
              {methods.map((m, index) => (
                <li key={m.method}>
                  <i style={{ background: colors[index % colors.length] }} />
                  {label(m.method)} · {money(m.amount)} ·{" "}
                  {((Number(m.amount) / total) * 100).toFixed(1)}%
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted">No received payments in this period.</p>
        )}
      </figure>
    </div>
  );
}
