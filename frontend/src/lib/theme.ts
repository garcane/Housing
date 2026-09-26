"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY as KEY } from "./theme-init";

export type Theme = "light" | "dark";

function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  // Re-render when the toggle changes data-theme, or when the device setting changes and no explicit choice is stored.
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(KEY); } catch {}
    if (stored !== "light" && stored !== "dark") document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
  };
  mq.addEventListener("change", onSystem);
  return () => {
    obs.disconnect();
    mq.removeEventListener("change", onSystem);
  };
}

/** The active theme; "light" during server rendering. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, current, () => "light");
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch {}
}
