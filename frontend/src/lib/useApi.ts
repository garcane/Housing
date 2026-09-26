"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

/** Client-side fetch of a JSON endpoint; `path = null` skips the request. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>({ path: null, data: null, error: null });

  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path)
      .then((data) => live && setState({ path, data, error: null }))
      .catch((e: Error) => live && setState({ path, data: null, error: e.message }));
    return () => { live = false; };
  }, [path]);

  const current = state.path === path;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: !!path && !current };
}
