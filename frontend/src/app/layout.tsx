import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import type { London } from "@/lib/api";
import { serverApi } from "@/lib/server-api";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";
import { longDate } from "@/lib/format";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "London Planning Atlas", template: "%s · London Planning Atlas" },
  description: "Approval rates, decision times, dwellings and land for full planning applications across London's boroughs, 2022–2025.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The footer date shouldn't take the whole site down if the API is briefly unavailable.
  const updated = await serverApi<London>("/api/london").then((l) => l.data_updated, () => null);
  return (
    // data-theme is set by the init script before hydration, so React shouldn't warn about it
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <TopNav />
        <main>{children}</main>
        <footer className="footer">
          <div className="container spread">
            <div className="stack" style={{ maxWidth: 560 }}>
              <div className="wordmark"><span className="wordmark-mark" aria-hidden /> London Planning Atlas</div>
              <p style={{ margin: 0 }}>
                Full planning applications started 2022–2025 across London&apos;s planning authorities. Borough boundaries © ONS;
                brownfield register © DLUHC; land use © OpenStreetMap contributors; Green Belt © Natural England.
              </p>
              {updated && <p className="updated" style={{ margin: 0 }}>Data last updated {longDate(updated)}</p>}
            </div>
            <nav className="row" style={{ gap: 24 }}>
              <Link href="/">Overview</Link>
              <Link href="/compare">Compare</Link>
              <Link href="/search">Applications</Link>
              <Link href="/other-authorities">Other authorities</Link>
              <Link href="/methodology">Methodology</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
