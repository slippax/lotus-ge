"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * wordmark and theme toggle. the toggle shows the destination - a moon means
 * "go dark" - which is the convention people expect and the easy one to get
 * backwards.
 */
export default function Masthead({ status }: { status?: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  // resolve the starting theme once on the client. until then render no icon
  // rather than guessing and flickering to the other one.
  useEffect(() => {
    const stored = window.localStorage.getItem("lotus-theme") as Theme | null;
    if (stored) {
      document.documentElement.setAttribute("data-theme", stored);
      setTheme(stored);
      return;
    }
    setTheme(
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    );
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("lotus-theme", next);
    setTheme(next);
  }

  const isDark = theme === "dark";

  return (
    // gap-2 not gap-3 - the status pill and toggle share a height and border
    // now, so they want to sit as one group. flex-1 keeps the wordmark left.
    <header className="flex items-center gap-2 py-[var(--s4)]">
      <h1 className="m-0 text-[16px] font-semibold uppercase tracking-[0.14em] text-band-ink">
        Lotus <span className="text-band-gold">GE</span>
      </h1>

      <span className="flex-1" />

      {status}

      <button
        type="button"
        onClick={toggle}
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        className="grid h-8 w-8 place-items-center rounded-full border border-[var(--band-line)] text-band-mute transition-colors hover:border-band-gold hover:text-band-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--band-gold)]"
      >
        {theme === null ? null : isDark ? <SunIcon /> : <MoonIcon />}
      </button>
    </header>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M4.3 4.3l1.6 1.6M18.1 18.1l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.3 19.7l1.6-1.6M18.1 5.9l1.6-1.6" />
    </svg>
  );
}
