import type { Metadata } from "next";
import { Suspense } from "react";
import SearchView from "@/components/SearchView";
import { api, type AuthoritySummary } from "@/lib/api";

export const metadata: Metadata = { title: "Search applications" };

export default async function SearchPage() {
  const [{ authorities }, filters] = await Promise.all([
    api<{ authorities: AuthoritySummary[] }>("/api/authorities"),
    api<{ outcome: string[]; size: string[]; year: number[]; land_type: string[]; route: string[] }>("/api/filters"),
  ]);
  return (
    <section className="section" style={{ paddingTop: 64 }}>
      <div className="container stack-lg">
        <div className="section-head">
          <div className="eyebrow">Applications</div>
          <h1 className="display-lg">Search full planning applications</h1>
          <p className="lede">Search descriptions, references, wards and agents. Open the council record or export what you find.</p>
        </div>
        <Suspense fallback={<div className="skeleton" style={{ height: 400 }} />}>
          <SearchView authorities={authorities.map((a) => ({ slug: a.slug, name: a.name }))} filters={filters} />
        </Suspense>
      </div>
    </section>
  );
}
