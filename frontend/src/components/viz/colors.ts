// Colour roles (see dataviz reference palette). Approved/rejected are the diverging poles used in main.ipynb.
export const C = {
  approved: "#2a78d6",
  rejected: "#e34948",
  withdrawn: "#eda100",
  undecided: "#a8a79f",
  neutral: "#a8a79f",
  london: "#9297a0",
  ink: "#181d26",
  ink2: "#41454d",
  grid: "#e4e3df",
  midpoint: "#f0efec",
  censored: "#f3f1ec",
};

export const OUTCOME_COLORS: Record<string, string> = {
  Approved: C.approved, Rejected: C.rejected, Withdrawn: C.withdrawn, Undecided: C.undecided, Unknown: C.neutral,
};

// First three categorical slots: validated all-pairs for maps/scatter.
export const LAND_COLORS: Record<string, string> = {
  Brownfield: "#2a78d6", Industrial: "#eb6834", "Virgin / greenfield": "#1baf7a", "Existing urban": "#a8a79f",
};

export const BROWNFIELD_COLORS: Record<string, string> = {
  Permissioned: C.approved, "Not permissioned": C.rejected, "Pending decision": "#eda100", "Other / unknown": C.neutral,
};

// Categorical slots in fixed order, for up to four compared boroughs (line/bar: adjacent pairs validated).
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

// Sequential blue ramp, 100 -> 700
export const SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => {
  const A = hex(a), B = hex(b);
  return toHex([0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t) as RGB);
};

/** Piecewise-linear interpolation through `stops` for t in [0, 1]. */
export function ramp(stops: string[], t: number) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

export const sequential = (t: number) => ramp(SEQ, t);

/** Diverging red <- gray -> blue around `mid` (used for approval rate vs the London average). */
export function diverging(v: number, min: number, mid: number, max: number) {
  if (v >= mid) return ramp([C.midpoint, "#6da7ec", C.approved, "#184f95"], (v - mid) / (max - mid || 1));
  return ramp([C.midpoint, "#f09a99", C.rejected, "#a82e2d"], (mid - v) / (mid - min || 1));
}

export function rgba(h: string, a = 255): [number, number, number, number] {
  const [r, g, b] = hex(h);
  return [r, g, b, a];
}
