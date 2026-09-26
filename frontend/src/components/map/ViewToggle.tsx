"use client";

/** 2D / 3D segmented control shown above a map. */
export default function ViewToggle({ threeD, onChange }: { threeD: boolean; onChange: (threeD: boolean) => void }) {
  return (
    <div className="seg" role="group" aria-label="Map view" data-no-export>
      <button type="button" aria-pressed={!threeD} onClick={() => onChange(false)}>2D</button>
      <button type="button" aria-pressed={threeD} onClick={() => onChange(true)}>3D</button>
    </div>
  );
}

/** Metres of extrusion for a value within [lo, hi]; the floor keeps the smallest borough visible. */
export const extrusion = (v: number, lo: number, hi: number, max = 7000, floor = 300) =>
  floor + ((v - lo) / (hi - lo || 1)) * (max - floor);
