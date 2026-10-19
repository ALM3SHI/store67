"use client";
import { useState } from "react";
import { formatSAR } from "@/lib/money";

/** Single-series daily revenue bars with a per-bar hover tooltip and a table fallback. */
export function SalesChart({ days, label = "المبيعات اليومية لآخر ٣٠ يومًا" }: { days: { day: string; revenue: number; n: number }[]; label?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(...days.map((d) => d.revenue), 1);
  const W = 600;
  const H = 180;
  const bw = W / Math.max(1, days.length);
  const barW = Math.min(36, Math.max(1, bw - Math.min(4, bw / 3)));
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const h = hover !== null ? days[hover] : null;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-metal-500">
        <span>{h ? `${h.day} — ${formatSAR(h.revenue, "ar")} (${h.n} طلب)` : "مرّر على الأعمدة لعرض التفاصيل"}</span>
        <button className="underline" onClick={() => setTable((v) => !v)}>{table ? "عرض الرسم" : "عرض كجدول"}</button>
      </div>
      {table ? (
        <div className="max-h-60 overflow-y-auto text-sm">
          <table className="w-full"><thead><tr className="text-metal-500"><th className="text-start">اليوم</th><th className="text-start">الطلبات</th><th className="text-start">المبيعات</th></tr></thead>
            <tbody>{days.filter((d) => d.n).map((d) => <tr key={d.day} className="border-t border-paper-2"><td dir="ltr" className="py-1 text-start">{d.day}</td><td>{d.n}</td><td>{formatSAR(d.revenue, "ar")}</td></tr>)}</tbody></table>
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label={label} style={{ direction: "ltr" }}>
          {ticks.map((t) => {
            const y = H - (t / max) * H;
            return (
              <g key={t}>
                <line x1={0} x2={W} y1={y} y2={y} stroke="var(--color-paper-2)" strokeWidth={1} />
                <text x={W} y={y - 4} textAnchor="end" fontSize={10} fill="var(--color-metal-500)">{formatSAR(t, "en")}</text>
              </g>
            );
          })}
          {days.map((d, i) => {
            const bh = d.revenue ? Math.max(3, (d.revenue / max) * (H - 14)) : 0;
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
                {bh ? <rect x={i * bw + (bw - barW) / 2} y={H - bh} width={barW} height={bh} rx={Math.min(3, bw / 4)} fill={hover === i ? "var(--color-volt-strong)" : "var(--color-volt)"} /> : null}
              </g>
            );
          })}
          {[...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])].filter((i) => i >= 0).map((i) => (
            <text key={i} x={i * bw + bw / 2} y={H + 16} fontSize={10} textAnchor="middle" fill="var(--color-metal-500)">{days[i]!.day.slice(5)}</text>
          ))}
        </svg>
      )}
    </div>
  );
}
