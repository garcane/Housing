import { connection } from "next/server";
import { api } from "./api";

/** Server-component fetch from FastAPI, rendered per request so `next build` doesn't need the API running. */
export async function serverApi<T>(path: string): Promise<T> {
  await connection();
  return api<T>(path);
}
