"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AuthoritySummary } from "@/lib/api";
import { num, pct } from "@/lib/format";

type Col = { key: keyof AuthoritySummary; label: string; fmt: (a: AuthoritySummary) => string; desc?: boolean };

const COLS: Col[] = [
  { key: "decided", label: "Decided", fmt: (a) => num(a.decided), desc: true },
  { key: "approval_rate", label: "Approval", fmt: (a) => pct(a.approval_rate, 1), desc: true },
  { key: "ci_low", label: "95% CI", fmt: (a) => `${pct(a.ci_low)}–${pct(a.ci_high)}`, desc: true },
  { key: "median_days", label: "Median days", fmt: (a) => num(a.median_days) },
  { key: "in_time", label: "In time", fmt: (a) => pct(a.in_time), desc: true },
  { key: "withdrawal_rate", label: "Withdrawn", fmt: (a) => pct(a.withdrawal_rate, 1) },
  { key: "approved_dwellings", label: "Approved homes", fmt: (a) => num(a.approved_dwellings), desc: true },
  { key: "approved_per_1000_people", label: "Homes / 1k people", fmt: (a) => (a.approved_per_1000_people == null ? "–" : a.approved_per_1000_people.toFixed(1)), desc: true },
  { key: "density_per_km2", label: "People / km²", fmt: (a) => num(a.density_per_km2), desc: true },
];

export default function RankingTable({ rows }: { rows: AuthoritySummary[] }) {
  const [sort, setSort] = useState<{ key: keyof AuthoritySummary; desc: boolean }>({ key: "approval_rate", desc: true });
  const sorted = useMemo(() => {
    const v = (a: AuthoritySummary) => (sort.key === "name" ? a.name : (a[sort.key] as number | null) ?? -Infinity);
    return [...rows].sort((a, b) => {
      const x = v(a), y = v(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return sort.desc ? -c : c;
    });
  }, [rows, sort]);

  const header = (key: keyof AuthoritySummary, label: string, desc = true, numeric = true) => (
    <th className={numeric ? "num" : ""} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : desc }))}>
        {label} {sort.key === key ? (sort.desc ? "↓" : "↑") : ""}
      </button>
    </th>
  );

  return (
    <div className="table-wrap" style={{ maxHeight: 640 }}>
      <table className="data">
        <thead>
          <tr>
            <th className="num">#</th>
            {header("name", "Borough", false, false)}
            {COLS.map((c) => <HeaderCell key={c.key} c={c} header={header} />)}
          </tr>
        </thead>
        <tbody>
          {sorted.map((a, i) => (
            <tr key={a.slug}>
              <td className="num muted">{i + 1}</td>
              <td><Link href={`/borough/${a.slug}`}>{a.name}</Link></td>
              {COLS.map((c) => <td key={c.key} className="num">{c.fmt(a)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeaderCell({ c, header }: { c: Col; header: (k: keyof AuthoritySummary, l: string, d?: boolean) => React.ReactNode }) {
  return <>{header(c.key, c.label, c.desc ?? false)}</>;
}
