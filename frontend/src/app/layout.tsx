import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "London Planning Atlas", template: "%s · London Planning Atlas" },
  description: "Approval rates, decision times, dwellings and land for full planning applications across London's boroughs, 2022–2025.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
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
