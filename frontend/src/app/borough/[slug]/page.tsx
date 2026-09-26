import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ApprovalCIChart from "@/components/charts/ApprovalCIChart";
import { LandShareBar, OutcomeShareBar, SizeCompare } from "@/components/charts/ProfileCharts";
import { DecisionHistogram, TrendPanels } from "@/components/charts/TimingCharts";
import WardScatter from "@/components/charts/WardScatter";
import { HomesMap, LandMap } from "@/components/map/ProfileMaps";
import Figure, { Key } from "@/components/viz/Figure";
import { C, LAND_COLORS } from "@/components/viz/colors";
import { api, ApiError, type Authority, type AuthoritySummary, type London } from "@/lib/api";
import { ha, num, ordinal, pct, pts, shortName } from "@/lib/format";

type Resp = { n_ranked: number; authority: Authority; london: London };

async function load(slug: string) {
  try {
    return await api<Resp>(`/api/authorities/${slug}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/borough/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { authority } = await load(slug);
  return { title: authority.name, description: `Planning approval, decision times, homes and land in ${authority.name}.` };
}

export default async function BoroughPage({ params }: PageProps<"/borough/[slug]">) {
  const { slug } = await params;
  const [{ authority: a, london, n_ranked }, { authorities }] = await Promise.all([
    load(slug),
    api<{ authorities: AuthoritySummary[] }>("/api/authorities"),
  ]);
  const ranked = authorities.filter((x) => x.kind === "borough" && x.reliable);
  const isOther = a.kind === "other";
  const lApproved = Math.round(london.approval_rate * london.counts.decided);
  const L = london.land;
  const timingGap = a.days_coverage != null && a.days_coverage < 0.8;

  return (
    <>
      {/* Header */}
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="container stack-lg">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">London</Link><span>/</span>
            {isOther ? <Link href="/other-authorities">Other authorities</Link> : <Link href="/#map">Boroughs</Link>}
            <span>/</span><span aria-current="page">{a.name}</span>
          </nav>
          <div className="spread">
            <div className="stack">
              <h1 className="display-xl">{a.name}</h1>
              <div className="row">
                {isOther ? <span className="chip">Not a borough · not ranked</span> : <span className="chip">London borough</span>}
                {a.ranks.approval_rate != null && <span className="chip">{ordinal(a.ranks.approval_rate)} of {n_ranked} for approval</span>}
                {a.ranks.median_days != null && <span className="chip">{ordinal(a.ranks.median_days)} fastest</span>}
                {a.ranks.approved_dwellings != null && <span className="chip">{ordinal(a.ranks.approved_dwellings)} for approved homes</span>}
              </div>
            </div>
            <div className="row">
              <a className="btn btn-secondary" href={`/api/authorities/${slug}/export.csv`} download>Download profile (CSV)</a>
              <Link className="btn btn-primary" href={`/compare?b=${slug}`}>Compare with…</Link>
            </div>
          </div>
          {isOther && (
            <p className="notice">
              {a.name} isn&apos;t one of the 32 London boroughs. It has only {num(a.decided)} decided full applications, so its rates are
              shown for reference but left out of rankings and London averages. {a.geo_borough ? "" : "It has no boundary of its own in the ONS data, so homes and land figures are reported under the host boroughs."}
            </p>
          )}
          <div className="grid-4" style={{ paddingTop: 16 }}>
            <Tile value={pct(a.approval_rate, 1)} label="Approval rate" sub={`${pts(a.approval_rate, london.approval_rate)} vs London · 95% CI ${pct(a.ci_low)}–${pct(a.ci_high)}`} />
            <Tile value={a.median_days == null ? "–" : `${a.median_days}`} label="Median days to decision"
              sub={a.median_days == null ? "" : `${a.median_days - london.median_days >= 0 ? "+" : "−"}${Math.abs(a.median_days - london.median_days)} days vs London (${london.median_days})${timingGap ? ` · data only to ${a.days_last_start}` : ""}`} />
            <Tile value={pct(a.in_time)} label="Decided within the statutory period" sub={`London ${pct(london.in_time)}`} />
            <Tile value={a.dwellings ? num(a.dwellings.approved_dwellings) : "–"} label="Dwellings approved"
              sub={a.dwellings ? `of ${num(a.dwellings.proposed_dwellings)} proposed · ${pct(a.dwellings.share_of_london_approved, 1)} of London` : "See host boroughs"} />
          </div>
        </div>
      </section>

      <nav className="subnav" aria-label="Sections">
        <div className="container">
          <a href="#outcomes">Approvals</a>
          <a href="#timing">Decision times</a>
          {a.dwellings && <a href="#dwellings">Homes</a>}
          {a.land && <a href="#land">Land &amp; population</a>}
          <a href="#applications">Applications</a>
        </div>
      </nav>

      {/* Outcomes */}
      <section className="section" id="outcomes">
        <div className="container stack-lg">
          <div className="section-head">
            <h2 className="display-md">Approvals and refusals</h2>
            <p className="lede">
              {num(a.total_full)} full applications, of which {num(a.decided)} were decided: {num(a.approved)} approved and {num(a.rejected)} refused.
              {" "}{num(a.withdrawn)} were withdrawn ({pct(a.withdrawal_rate, 1)}) and {num(a.undecided)} are still undecided.
            </p>
          </div>
          <div className="split">
            <div className="stack-lg">
              <Figure title="What happened to every full application" subtitle="Share of all full applications, by outcome"
                legend={<>{(["Approved", "Rejected", "Withdrawn", "Undecided"] as const).map((o) => <Key key={o} color={{ Approved: C.approved, Rejected: C.rejected, Withdrawn: C.withdrawn, Undecided: C.undecided }[o]} label={o === "Rejected" ? "Refused" : o} />)}</>}>
                <OutcomeShareBar name={a.name}
                  borough={{ Approved: a.approved, Rejected: a.rejected, Withdrawn: a.withdrawn, Undecided: a.undecided }}
                  london={{ Approved: lApproved, Rejected: london.counts.decided - lApproved, Withdrawn: london.counts.withdrawn, Undecided: london.counts.undecided }} />
              </Figure>
              <Figure title="Approval by application size" subtitle="Dot = this authority; grey tick = London. Sizes with fewer than 10 decisions are hidden."
                legend={<><Key color={C.approved} label={shortName(a.name)} /><Key color={C.london} label="London" line /></>}>
                <SizeCompare borough={a.by_size} london={london.by_size} />
              </Figure>
            </div>
            <Figure title={`${shortName(a.name)} among London's boroughs`} subtitle="Approval rate with 95% confidence interval. Click a row to switch borough.">
              <ApprovalCIChart rows={isOther ? [...ranked, { ...a, name: a.name }] : ranked} london={london.approval_rate} highlight={slug} />
            </Figure>
          </div>
        </div>
      </section>

      {/* Timing */}
      <section className="section band-soft" id="timing">
        <div className="container stack-lg">
          <div className="section-head">
            <h2 className="display-md">Decision times</h2>
            <p className="lede">
              Half of decided applications took {a.median_days ?? "–"} days or less. The middle 50% took {a.q1 ?? "–"}–{a.q3 ?? "–"} days
              and one in ten took more than {a.p90 != null ? Math.round(a.p90) : "–"} days.
            </p>
          </div>
          {timingGap && (
            <p className="notice">
              {a.name}&apos;s records stop giving decision times for applications started after {a.days_last_start}. Only {pct(a.days_coverage)} of
              decided applications have one, so the timing figures here describe the earlier applications and aren&apos;t directly comparable with other boroughs.
            </p>
          )}
          <div className="grid-4">
            <div className="card"><Tile value={`${a.median_approved ?? "–"} / ${a.median_rejected ?? "–"}`} label="Median days: approved / refused" /></div>
            <div className="card"><Tile value={pct(a.committee_share)} label="Decided at committee" sub={`London average ${pct(london.means.committee_share)} · where route is recorded`} /></div>
            <div className="card"><Tile value={a.median_days_committee != null ? `${a.median_days_committee}` : "–"} label="Median days at committee" /></div>
            <div className="card"><Tile value={a.median_days_delegated != null ? `${a.median_days_delegated}` : "–"} label="Median days, delegated" /></div>
          </div>
          <DecisionHistogram slug={slug} name={a.name} />
          <TrendPanels slug={slug} name={a.name} />
          <WardScatter slug={slug} boroughApproval={a.approval_rate} boroughDays={a.median_days} />
        </div>
      </section>

      {/* Homes */}
      {a.dwellings && (
        <section className="section" id="dwellings">
          <div className="container stack-lg">
            <div className="card-forest split" style={{ alignItems: "center" }}>
              <div className="stack">
                <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>Homes</div>
                <h2 className="display-md">{num(a.dwellings.approved_dwellings)} homes approved across {num(a.dwellings.approved_schemes)} schemes</h2>
                <p className="muted" style={{ fontSize: 16, margin: 0 }}>
                  That is {a.dwellings.approved_per_1000_people?.toFixed(1) ?? "–"} per 1,000 residents (borough average {london.means.approved_per_1000_people.toFixed(1)}).
                  Only larger schemes publish a dwelling count, and repeat submissions for the same scheme are counted once.
                </p>
              </div>
              <div className="grid-2">
                <Tile value={num(a.dwellings.schemes)} label="Schemes proposed" />
                <Tile value={num(a.dwellings.proposed_dwellings)} label="Dwellings proposed" />
                <Tile value={num(a.dwellings.median_scheme_size)} label="Median scheme size" />
                <Tile value={num(a.dwellings.largest_scheme)} label="Largest scheme" />
              </div>
            </div>
            <HomesMap slug={slug} />
          </div>
        </section>
      )}

      {/* Land */}
      {a.land && (
        <section className="section" id="land" style={{ paddingTop: a.dwellings ? 0 : undefined }}>
          <div className="container stack-lg">
            <div className="section-head">
              <h2 className="display-md">Land and population</h2>
              <p className="lede">
                {num(a.land.population)} residents ({a.land.pop_year}) on {num(a.land.area_ha / 100)} km²: {num(a.land.density_per_km2)} people per km²,
                against {num(L.density_per_km2)} across London.
              </p>
            </div>
            <div className="grid-4">
              <div className="card"><Tile value={ha(a.land.brownfield_ha)} label="Brownfield register" sub={`${num(a.land.brownfield_sites)} sites · ${pct(a.land.brownfield_permissioned_share)} with permission`} /></div>
              <div className="card"><Tile value={ha(a.land.industrial_ha)} label="Industrial land (OSM)" sub={`${pct(a.land.industrial_pct, 1)} of area`} /></div>
              <div className="card"><Tile value={ha(a.land.greenfield_ha)} label="Virgin / greenfield (OSM)" sub={`${pct(a.land.greenfield_pct, 1)} of area`} /></div>
              <div className="card"><Tile value={pct(a.land.green_belt_pct)} label="Green Belt share" sub={ha(a.land.green_belt_ha)} /></div>
            </div>
            <div className="grid-2" style={{ alignItems: "start" }}>
              <Figure title="Available land as a share of area" subtitle="Brownfield (register), industrial and greenfield (OpenStreetMap)"
                legend={<>{(["Brownfield", "Industrial", "Virgin / greenfield"] as const).map((t) => <Key key={t} color={LAND_COLORS[t]} label={t} />)}</>}>
                <LandShareBar name={a.name} borough={a.land}
                  london={{ brownfield_pct: L.brownfield_ha / L.area_ha, industrial_pct: L.industrial_ha / L.area_ha, greenfield_pct: L.greenfield_ha / L.area_ha }} />
              </Figure>
              <Figure title="Approval by the land an application sits on" subtitle="Decided full applications located in this borough (includes development-corporation cases). Rates need 20+ decisions.">
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>Land type</th><th className="num">Decided</th><th className="num">Approval</th><th className="num">London</th></tr></thead>
                    <tbody>
                      {a.by_land_type.map((r) => (
                        <tr key={r.land_type}>
                          <td><span className="row" style={{ gap: 8 }}><i className="swatch" style={{ background: LAND_COLORS[r.land_type] }} />{r.land_type}</span></td>
                          <td className="num">{num(r.n)}</td>
                          <td className="num">{r.approval_rate == null ? "–" : pct(r.approval_rate)}</td>
                          <td className="num muted">{pct(london.by_land_type.find((x) => x.land_type === r.land_type)?.approval_rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Figure>
            </div>
            <LandMap slug={slug} />
          </div>
        </section>
      )}

      {/* Applications CTA */}
      <section className="section-tight" id="applications" style={{ paddingBottom: 96 }}>
        <div className="container">
          <div className="cta-band spread" style={{ alignItems: "center" }}>
            <div className="stack">
              <h2 className="display-md">Browse {num(a.total_full)} applications in {shortName(a.name)}</h2>
              <p className="lede">Filter by outcome, size, year and land type, open the council record, or export to CSV.</p>
            </div>
            <Link href={`/search?slug=${slug}`} className="btn btn-primary btn-lg">Search applications</Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Tile({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
