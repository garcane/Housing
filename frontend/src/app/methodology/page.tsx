import type { Metadata } from "next";
import { api, type London } from "@/lib/api";
import { num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Methodology" };

export default async function Methodology() {
  const l = await api<London>("/api/london");
  return (
    <section className="section">
      <div className="container">
        <div className="prose">
          <div className="eyebrow">Methodology</div>
          <h1 className="display-lg" style={{ marginTop: 12 }}>How the numbers are built</h1>
          <p className="lede" style={{ marginTop: 16 }}>
            The site is generated from the analysis in <code>main.ipynb</code>. The cleaning rules live in
            <code> backend/pipeline/cleaning.py</code> and are shared by the notebook logic and the API, so the figures here match the notebook.
          </p>

          <h2>Data</h2>
          <ul>
            <li><b>Planning applications:</b> {num(l.counts.all_rows)} applications across London&apos;s planning authorities, started {l.period.start_min} to {l.period.start_max}, with decisions up to {l.period.decided_max}.</li>
            <li><b>Boundaries:</b> ONS Local Authority Districts (December 2023, generalised clipped), London codes E09.</li>
            <li><b>Population:</b> ONS mid-year estimates, {l.land.pop_year}.</li>
            <li><b>Brownfield Land Register:</b> current entries (no end date) with a point location and site area.</li>
            <li><b>Land use:</b> OpenStreetMap <code>landuse</code> polygons: industrial, and farmland, meadow or greenfield (&quot;virgin / greenfield&quot;).</li>
            <li><b>Green Belt:</b> Natural England Green Belt boundaries, clipped to London.</li>
          </ul>

          <h2>Scope and outcomes</h2>
          <p>
            Only <b>full</b> planning applications are included ({num(l.counts.full)} in the 32 boroughs). Outcomes come from the dataset&apos;s
            normalised <code>status</code>: <i>Permitted</i> and <i>Conditions</i> count as approved; <i>Rejected</i> as refused; <i>Withdrawn</i> on its own; <i>Undecided</i>, <i>Unresolved</i> and <i>Referred</i> as undecided.
            <b> Approval rate = approved ÷ (approved + refused)</b>, so withdrawn and undecided applications are excluded from the denominator.
            The withdrawal rate is withdrawn ÷ all full applications.
          </p>
          <p>
            London-wide figures cover the 32 boroughs. The City of London and the two Mayoral Development Corporations are reported
            separately, and rankings only include authorities with at least 100 decided full applications.
          </p>

          <h2>Confidence intervals</h2>
          <p>
            Approval rates carry 95% <b>Wilson score</b> intervals, which behave better than the normal approximation for rates near 0 or 1 and for small samples.
            London&apos;s approval rate is {pct(l.approval_rate, 1)} ({pct(l.approval_ci[0], 1)}–{pct(l.approval_ci[1], 1)}).
          </p>

          <h2>Decision times</h2>
          <ul>
            <li>Days to decision is taken from the data. Negative values are treated as errors and dropped. Very long durations are real (appeals, S106 agreements), so they stay in, and medians are used so they don&apos;t dominate.</li>
            <li><b>Within the statutory period</b> means decided within 56 days (8 weeks), or 91 days (13 weeks) for Large applications. Agreed extensions of time and Planning Performance Agreements are <i>not</i> counted, so this is stricter than official DLUHC statistics.</li>
            <li><b>Decision route</b> collapses about 200 free-text <code>decided_by</code> values into Committee, Delegated and Other. The route is missing for about a quarter of decisions, so the committee share is under-counted.</li>
          </ul>

          <h2 id="timing-gaps">Gaps in decision-time data</h2>
          <p>
            Some boroughs&apos; records stop giving a decision time part-way through the period. Their approval and refusal counts are
            complete, but their timing measures (median days, share in time, trends) only describe the applications that have a time recorded:
          </p>
          <ul>
            {l.timing_gaps.map((g) => (
              <li key={g.slug}><b>{g.name}</b>: {pct(g.coverage)} of decided applications have a decision time; the latest was for an application started in {g.last_start}.</li>
            ))}
          </ul>
          <p>
            This matters most for Barking &amp; Dagenham, which ranks as London&apos;s fastest borough on 2022–23 applications alone. Whether it
            stayed that fast for later cohorts can&apos;t be seen in this data. The notebook&apos;s section 5 figures carry the same limitation.
          </p>

          <h2>Trends and right-censoring</h2>
          <p>
            Trends group applications by the quarter they <i>started</i>. Recent cohorts are right-censored: slow applications that are still undecided
            are missing, which makes recent quarters look faster (and possibly more approving) than they will end up. Quarters with more than 10% still
            undecided are shaded.
          </p>

          <h2>Dwellings</h2>
          <p>Adding up <code>n_dwellings</code> naively overstates the total several times over. The count is built like this:</p>
          <ul>
            <li>Only Full and Outline applications with a dwelling count are used. This covers <b>larger schemes only</b> (the smallest value is 7), and householder extensions carry no count.</li>
            <li>Derivative submissions that repeat the parent scheme&apos;s figure are dropped: condition discharges, non-material and minor-material amendments, variations/section 73, consultation replies to neighbouring boroughs, and scoping/screening opinions.</li>
            <li>The remaining rows are grouped into <b>schemes</b> by the same dwelling count at the same location (3 decimal places, about 100 m), or by description where there are no coordinates. A scheme counts as approved if any of its applications was approved.</li>
            <li>Schemes are assigned to boroughs by location. This gives {num(l.dwellings.schemes)} schemes and {num(l.dwellings.approved)} approved dwellings out of {num(l.dwellings.proposed)} proposed.</li>
          </ul>
          <p>Boroughs whose portals rarely publish dwelling counts (e.g. Redbridge, Barking &amp; Dagenham, Richmond, Waltham Forest) will look under-supplied. Some double counting can remain where an outline permission and its reserved-matters application have slightly different coordinates or numbers.</p>

          <h2>Land</h2>
          <ul>
            <li>Land areas come from the dissolved polygons intersected with each borough in British National Grid, so overlapping polygons aren&apos;t double counted. &quot;Available land&quot; = brownfield + industrial + virgin/greenfield.</li>
            <li>An application counts as <b>on brownfield</b> if it falls within a circle of the registered site area around the register point (minimum radius 20 m, to allow for geocoding offsets). Industrial, greenfield and Green Belt flags use point-in-polygon tests. Brownfield takes priority, then industrial, then greenfield; everything else is &quot;existing urban&quot;.</li>
            <li>Brownfield register updates differ by borough, and OpenStreetMap land-use coverage is uneven, so land figures are indicative.</li>
          </ul>

          <h2>What this can and can&apos;t tell you</h2>
          <ul>
            <li><b>These are correlations, not causes.</b> Borough differences can reflect the kinds of applications each borough receives (including pre-application advice and local housing types) as well as how it decides them.</li>
            <li>At borough level, median decision time and approval rate barely correlate (Spearman ρ = {l.speed_vs_approval.spearman_rho.toFixed(2)}, p = {l.speed_vs_approval.p.toFixed(2)}).</li>
            <li><code>n_comments</code> and <code>n_dwellings</code> are sparse, and how often they&apos;re missing depends on the borough.</li>
            <li>A few raw decision labels are noisy (e.g. &quot;Approve No Conditions&quot; filed under Conditions), but this doesn&apos;t affect the approved vs refused split.</li>
          </ul>

          <h2>Rebuilding the data</h2>
          <p>
            Run <code>uv run python -m backend.pipeline.build</code> after updating anything in <code>data/</code>. It rewrites
            <code> data/processed/</code> and prints the key numbers, so you can check them against section 8 of the notebook.
          </p>
        </div>
      </div>
    </section>
  );
}
