// MapLibre v6 starts its web worker from a URL relative to its own module, which the Next bundler
// doesn't rewrite. Serve the worker (and the chunk it shares with the main bundle) from /public instead.
import { copyFileSync, mkdirSync } from "node:fs";

const src = "node_modules/maplibre-gl/dist";
const dest = "public/maplibre";
mkdirSync(dest, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(`${src}/${f}`, `${dest}/${f}`);
