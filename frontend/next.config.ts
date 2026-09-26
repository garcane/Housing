import type { NextConfig } from "next";

// FastAPI runs separately (see README). The browser calls /api/* on this origin and Next proxies it,
// so there's no CORS setup to get wrong; server components call API_URL directly.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
