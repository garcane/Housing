"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/compare", label: "Compare boroughs" },
  { href: "/search", label: "Applications" },
  { href: "/other-authorities", label: "Other authorities" },
  { href: "/methodology", label: "Methodology" },
];

export default function TopNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/borough") : path.startsWith(href));

  return (
    <header className="top-nav">
      <div className="container">
        <Link href="/" className="wordmark" onClick={() => setOpen(false)}>
          <span className="wordmark-mark" aria-hidden>
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 11V5l5-4 5 4v6H7.5V7.5h-3V11z" fill="#fff" /></svg>
          </span>
          London Planning Atlas
        </Link>
        <nav className={`nav-links${open ? " open" : ""}`} aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
        <Link href="/compare" className="btn btn-primary btn-sm nav-cta">Compare boroughs</Link>
        <button className="nav-toggle" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.6"><path d="M2 5h14M2 9h14M2 13h14" /></svg>
        </button>
      </div>
    </header>
  );
}
