const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export const num = (v: number | null | undefined) => (v == null ? "–" : nf0.format(v));
export const num1 = (v: number | null | undefined) => (v == null ? "–" : nf1.format(v));
export const pct = (v: number | null | undefined, digits = 0) => (v == null ? "–" : `${(v * 100).toFixed(digits)}%`);
export const days = (v: number | null | undefined) => (v == null ? "–" : `${nf0.format(v)} days`);
export const ha = (v: number | null | undefined) => (v == null ? "–" : `${nf0.format(v)} ha`);

/** Percentage-point difference, signed: "+4.1 pts" */
export const pts = (a: number, b: number) => {
  const d = (a - b) * 100;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`;
};

export const ordinal = (n: number | null | undefined) => {
  if (n == null) return "–";
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export const shortName = (name: string) =>
  name.replace(" Development Corporation", " DC").replace("Hammersmith and Fulham", "Hammersmith & Fulham")
    .replace("Kensington and Chelsea", "Kensington & Chelsea").replace("Barking and Dagenham", "Barking & Dagenham");
