import Link from "next/link";
import ApprovalCIChart from "@/components/charts/ApprovalCIChart";
import SpeedScatter from "@/components/charts/SpeedScatter";
import OverviewMap from "@/components/OverviewMap";
import RankingTable from "@/components/RankingTable";
import Figure from "@/components/viz/Figure";
import { type AuthoritySummary, type London } from "@/lib/api";
import { serverApi } from "@/lib/server-api";
import { num, pct, shortName } from "@/lib/format";

export default async function Home() {
  const [london, { authorities, n_ranked }] = await Promise.all([
    serverApi<London>("/api/london"),
    serverApi<{ n_ranked: number; authorities: AuthoritySummary[] }>("/api/authorities"),
  ]);
  const boroughs = authorities.filter((a) => a.kind === "borough");
  const hi = london.highest[0], lo = london.lowest[0];
  const refusalRatio = (1 - lo.value) / (1 - hi.value);

  return (
    <>
      {/* Hero */}
      <section className="section">
        <div className="container stack-lg">
          <div className="eyebrow">London · full planning applications · started {london.period.start_min.slice(0, 4)}–{london.period.start_max.slice(0, 4)}</div>
          <h1 className="display-lg" style={{ maxWidth: 820 }}>How London&apos;s boroughs decide planning applications</h1>
          <p className="lede">
            Approval and refusal rates, decision times, new homes and available land for each of London&apos;s 32 boroughs,
            built from {num(london.counts.full)} full applications.
          </p>
          <div className="row">
            <a href="#map" className="btn btn-primary btn-lg">Find a borough</a>
            <Link href="/search" className="btn btn-secondary btn-lg">Search applications</Link>
          </div>
          <div className="grid-4" style={{ paddingTop: 32 }}>
            <Stat value={pct(london.approval_rate)} label="Approved" sub={`of ${num(london.counts.decided)} decided full applications`} />
            <Stat value={`${london.median_days}`} label="Median days to a decision" sub="Statutory target: 56 days (91 for major)" />
            <Stat value={pct(london.in_time)} label="Decided within the statutory period" sub="Not counting agreed extensions" />
            <Stat value={num(london.dwellings.approved)} label="Dwellings approved" sub={`across ${num(london.dwellings.schemes)} larger housing schemes`} />
          </div>
        </div>
      </section>

      {/* Map */}
      <section className="section band-soft" id="map">
        <div className="container">
          <div className="section-head">
            <h2 className="display-md">Pick a borough</h2>
            <p className="lede">Switch the measure to see where approvals, speed, new homes and land are concentrated.</p>
          </div>
          <OverviewMap authorities={authorities} londonApproval={london.approval_rate} nRanked={n_ranked} />
        </div>
      </section>

      {/* Signature: headline finding */}
      <section className="section-tight">
        <div className="container">
          <div className="card-coral split" style={{ alignItems: "center" }}>
            <div className="stack">
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.75)" }}>Key finding</div>
              <h2 className="display-md">Where you apply matters more than what you apply for</h2>
              <p className="muted" style={{ fontSize: 16, margin: 0 }}>
                Approval ranges from {pct(london.approval_range.min)} in {lo.name} to {pct(london.approval_range.max)} in {hi.name}.
                An applicant in {shortName(lo.name)} is about {refusalRatio.toFixed(0)}× as likely to be refused. Borough is more strongly
                associated with the outcome than application size, and the ranking barely moves when only small applications are counted.
              </p>
            </div>
            <div className="grid-2">
              <div className="stack">
                <div className="stat-label" style={{ color: "rgba(255,255,255,.78)" }}>Highest approval</div>
                {london.highest.map((b) => <BoroughChip key={b.slug} b={b} fmt={(v) => pct(v)} />)}
              </div>
              <div className="stack">
                <div className="stat-label" style={{ color: "rgba(255,255,255,.78)" }}>Lowest approval</div>
                {london.lowest.map((b) => <BoroughChip key={b.slug} b={b} fmt={(v) => pct(v)} />)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Approval + speed */}
      <section className="section">
        <div className="container grid-2" style={{ alignItems: "start" }}>
          <Figure
            title="Approval rate by borough"
            subtitle="Decided full applications, with 95% confidence intervals. Click a row for the profile."
          >
            <ApprovalCIChart rows={boroughs.filter((b) => b.reliable)} london={london.approval_rate} />
          </Figure>
          <div className="stack-lg">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <h2 className="title-lg">Speed and approval are largely unrelated</h2>
              <p className="muted" style={{ fontSize: 16 }}>
                Borough median decision time and approval rate barely correlate (Spearman ρ = {london.speed_vs_approval.spearman_rho.toFixed(2)},
                p = {london.speed_vs_approval.p.toFixed(2)}). Approved and refused applications take almost the same time
                ({london.median_days_approved} vs {london.median_days_rejected} days).
              </p>
            </div>
            <Figure title="Median decision time vs approval rate" subtitle="Dot area = decided applications">
              <SpeedScatter rows={boroughs.filter((b) => b.reliable)} london={{ approval: london.approval_rate, days: london.median_days }} />
            </Figure>
            <div className="grid-2">
              <div className="card">
                <div className="stat-label">Fastest medians</div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {london.fastest.map((b) => <li key={b.slug}><Link href={`/borough/${b.slug}`}>{b.name}</Link> · {b.value} days</li>)}
                </ul>
              </div>
              <div className="card">
                <div className="stat-label">Slowest medians</div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {london.slowest.map((b) => <li key={b.slug}><Link href={`/borough/${b.slug}`}>{b.name}</Link> · {b.value} days</li>)}
                </ul>
              </div>
            </div>
            {!!london.timing_gaps?.length && (
              <p className="notice" style={{ margin: 0 }}>
                {london.timing_gaps.map((g) => shortName(g.name)).join(", ")} stop publishing decision times for applications started after mid-2023,
                so their medians reflect 2022–23 applications only. <Link href="/methodology#timing-gaps">Details</Link>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Dwellings callout */}
      <section className="section-tight">
        <div className="container">
          <div className="card-cream split" style={{ padding: 48, alignItems: "center" }}>
            <div className="stack">
              <div className="eyebrow">Housing supply</div>
              <h2 className="display-md">{num(london.dwellings.approved)} homes approved in larger schemes</h2>
              <p style={{ fontSize: 16, margin: 0 }}>
                Out of {num(london.dwellings.proposed)} proposed across {num(london.dwellings.schemes)} distinct schemes. The five biggest
                boroughs account for {pct(london.dwellings.top5_share)} of approved homes. Dwelling counts are only published for larger
                schemes, so boroughs whose portals rarely report them will look under-supplied.
              </p>
            </div>
            <div className="grid-2">
              {[...boroughs].sort((a, b) => (b.approved_dwellings ?? 0) - (a.approved_dwellings ?? 0)).slice(0, 4).map((b) => (
                <Link key={b.slug} href={`/borough/${b.slug}#dwellings`} className="card" style={{ color: "inherit" }}>
                  <div className="stat-value" style={{ fontSize: 32 }}>{num(b.approved_dwellings)}</div>
                  <div className="stat-label">{b.name}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2 className="display-md">All boroughs</h2>
            <p className="lede">Sort by any column. Rates use decided (approved + refused) applications; homes are from de-duplicated schemes.</p>
          </div>
          <RankingTable rows={boroughs} />
        </div>
      </section>

      {/* Land */}
      <section className="section-tight">
        <div className="container">
          <div className="card-dark split">
            <div className="stack">
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>Land</div>
              <h2 className="display-md">Brownfield gets approved more often. Green Belt and greenfield get approved much less.</h2>
              <p className="muted" style={{ fontSize: 16, margin: 0 }}>
                London has {num(london.land.brownfield_ha)} ha on the brownfield register ({num(london.land.brownfield_sites)} sites),
                plus {num(london.land.industrial_ha)} ha of industrial land and {num(london.land.green_belt_ha)} ha of Green Belt.
                Approval rates by the land an application sits on:
              </p>
            </div>
            <table className="data" style={{ color: "#fff" }}>
              <thead>
                <tr>
                  <th style={{ background: "transparent", color: "rgba(255,255,255,.7)", borderColor: "rgba(255,255,255,.2)" }}>Land type</th>
                  <th className="num" style={{ background: "transparent", color: "rgba(255,255,255,.7)", borderColor: "rgba(255,255,255,.2)" }}>Decided</th>
                  <th className="num" style={{ background: "transparent", color: "rgba(255,255,255,.7)", borderColor: "rgba(255,255,255,.2)" }}>Approval</th>
                  <th className="num" style={{ background: "transparent", color: "rgba(255,255,255,.7)", borderColor: "rgba(255,255,255,.2)" }}>Medium + large</th>
                </tr>
              </thead>
              <tbody>
                {london.by_land_type.map((r, i) => (
                  <tr key={r.land_type}>
                    <td style={{ color: "#fff", borderColor: "rgba(255,255,255,.15)" }}>{r.land_type}</td>
                    <td className="num" style={{ color: "#fff", borderColor: "rgba(255,255,255,.15)" }}>{num(r.n)}</td>
                    <td className="num" style={{ color: "#fff", borderColor: "rgba(255,255,255,.15)" }}>{pct(r.approval_rate)}</td>
                    <td className="num" style={{ color: "#fff", borderColor: "rgba(255,255,255,.15)" }}>{pct(london.by_land_type_medium_large[i]?.approval_rate)}</td>
                  </tr>
                ))}
                {london.green_belt.filter((g) => g.group === "In Green Belt").map((g) => (
                  <tr key={g.group}>
                    <td style={{ color: "#fff", borderColor: "rgba(255,255,255,.15)" }}>In the Green Belt</td>
                    <td className="num" style={{ color: "#fff", borderColor: "rgba(255,255,255,.15)" }}>{num(g.n)}</td>
                    <td className="num" style={{ color: "#fff", borderColor: "rgba(255,255,255,.15)" }}>{pct(g.approval_rate)}</td>
                    <td style={{ borderColor: "rgba(255,255,255,.15)" }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-tight" style={{ paddingBottom: 96 }}>
        <div className="container">
          <div className="cta-band spread" style={{ alignItems: "center" }}>
            <div className="stack">
              <h2 className="display-md">Put boroughs side by side</h2>
              <p className="lede">Compare up to four boroughs on approval, speed, homes and land.</p>
            </div>
            <Link href="/compare" className="btn btn-primary btn-lg">Compare boroughs</Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function BoroughChip({ b, fmt }: { b: { name: string; slug: string; value: number }; fmt: (v: number) => string }) {
  return (
    <Link href={`/borough/${b.slug}`} className="chip chip-dark" style={{ justifyContent: "space-between", width: "100%" }}>
      <span>{shortName(b.name)}</span>
      <span className="num">{fmt(b.value)}</span>
    </Link>
  );
}
