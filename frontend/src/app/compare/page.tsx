import type { Metadata } from "next";
import CompareView from "@/components/CompareView";
import { type Authority, type AuthoritySummary, type London } from "@/lib/api";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Compare boroughs" };

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const sp = await searchParams;
  const raw = typeof sp.b === "string" ? sp.b : "";
  const [{ authorities }, london] = await Promise.all([
    serverApi<{ authorities: AuthoritySummary[] }>("/api/authorities"),
    serverApi<London>("/api/london"),
  ]);
  const known = new Set(authorities.map((a) => a.slug));
  // Four fixed colour slots; an empty slot keeps the others' colours stable when one is removed.
  let slots = raw.split(",").slice(0, 4).map((s) => (known.has(s) ? s : ""));
  if (!slots.some(Boolean)) slots = ["camden", "hackney", "barking-and-dagenham"];
  while (slots.length < 4) slots.push("");

  const details = await Promise.all(slots.map((s) => (s ? serverApi<{ authority: Authority }>(`/api/authorities/${s}`).then((r) => r.authority) : null)));

  return (
    <section className="section">
      <div className="container stack-lg">
        <div className="section-head">
          <div className="eyebrow">Compare</div>
          <h1 className="display-lg">Compare boroughs</h1>
          <p className="lede">Pick up to four authorities. Each keeps its colour while you add or remove others.</p>
        </div>
        <CompareView authorities={authorities} slots={slots} details={details} london={london} />
      </div>
    </section>
  );
}
