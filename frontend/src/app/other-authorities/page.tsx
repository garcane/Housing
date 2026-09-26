import type { Metadata } from "next";
import Link from "next/link";
import { type AuthoritySummary, type London } from "@/lib/api";
import { serverApi } from "@/lib/server-api";
import { num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Other planning authorities" };

const ABOUT: Record<string, string> = {
  "city-of-london": "The City of London Corporation is a local planning authority for the Square Mile. It isn't a London borough, and its full-application numbers are small.",
  "old-oak-and-park-royal-development-corporation": "A Mayoral Development Corporation that took over planning powers for the Old Oak and Park Royal regeneration area from parts of Ealing, Hammersmith & Fulham and Brent.",
  "london-legacy-development-corporation": "A Mayoral Development Corporation set up for the Queen Elizabeth Olympic Park and surrounding area, covering parts of Hackney, Newham, Tower Hamlets and Waltham Forest. Planning powers returned to those boroughs from December 2024.",
};

export default async function OtherAuthorities() {
  const [{ authorities }, london] = await Promise.all([
    serverApi<{ authorities: AuthoritySummary[] }>("/api/authorities"),
    serverApi<London>("/api/london"),
  ]);
  const others = authorities.filter((a) => a.kind === "other");

  return (
    <>
      <section className="section">
        <div className="container stack-lg">
          <div className="section-head">
            <div className="eyebrow">Other authorities</div>
            <h1 className="display-lg">Planning authorities that aren&apos;t boroughs</h1>
            <p className="lede">
              Three authorities in the data aren&apos;t among London&apos;s 32 boroughs. Each has fewer than 100 decided full applications,
              so they get profiles but are left out of rankings and London-wide averages.
            </p>
          </div>
          <div className="grid-3">
            {others.map((a) => (
              <Link key={a.slug} href={`/borough/${a.slug}`} className="card stack" style={{ color: "inherit", padding: 32 }}>
                <h2 className="title-lg">{a.name}</h2>
                <p className="muted" style={{ margin: 0 }}>{ABOUT[a.slug]}</p>
                <div className="grid-2" style={{ gap: 16, paddingTop: 8 }}>
                  <div className="stat"><div className="stat-value" style={{ fontSize: 32 }}>{num(a.decided)}</div><div className="stat-label">Decided</div></div>
                  <div className="stat"><div className="stat-value" style={{ fontSize: 32 }}>{pct(a.approval_rate)}</div><div className="stat-label">Approved</div></div>
                  <div className="stat"><div className="stat-value" style={{ fontSize: 32 }}>{a.median_days ?? "–"}</div><div className="stat-label">Median days</div></div>
                  <div className="stat"><div className="stat-value" style={{ fontSize: 32 }}>{pct(a.ci_low)}–{pct(a.ci_high)}</div><div className="stat-label">95% CI</div></div>
                </div>
                <span className="btn btn-secondary" style={{ alignSelf: "flex-start" }}>Open profile</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="section-tight" style={{ paddingBottom: 96 }}>
        <div className="container">
          <div className="card-cream stack" style={{ padding: 48 }}>
            <h2 className="title-lg">Why the confidence intervals are wide</h2>
            <p style={{ fontSize: 16, margin: 0, maxWidth: 760 }}>
              With under 100 decisions, one or two outcomes move the rate by several points. Compare the 95% intervals above with
              London&apos;s ({pct(london.approval_ci[0], 1)}–{pct(london.approval_ci[1], 1)}). On the maps, development-corporation applications
              are placed in the borough where the site is, so they count towards that borough&apos;s homes and land figures.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
