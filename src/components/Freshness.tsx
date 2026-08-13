"use client";

import { useEffect, useState } from "react";
import { isStale, timeAgo } from "@/lib/signals";

type State = "loading" | "live" | "error";

/**
 * How current the prices are, in the masthead.
 *
 * This is the first thing worth knowing about a market page and it was sitting
 * under the list where nobody would look. The dot carries the state so it
 * reads at a glance; the text carries the detail.
 *
 * It re-renders on a timer so "2m ago" doesn't quietly become a lie while the
 * tab sits open.
 */
export default function Freshness({
  updatedAt,
  state,
}: {
  updatedAt: Date | null;
  state: State;
}) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (state !== "live") return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [state]);

  const stale = state === "live" && isStale(updatedAt);

  const dot =
    state === "error"
      ? "var(--band-down)"
      : state === "loading"
        ? "var(--band-mute)"
        : stale
          ? "var(--band-gold)"
          : "var(--band-up)";

  const text =
    state === "error"
      ? "Prices unavailable"
      : state === "loading"
        ? "Loading prices"
        : `Updated ${timeAgo(updatedAt)}`;

  return (
    <span
      className="flex items-center gap-2 text-[13px] text-band-mute"
      title={updatedAt ? updatedAt.toLocaleString() : undefined}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          state === "live" && !stale
            ? "animate-[lotus-pulse_2.8s_ease-in-out_infinite]"
            : ""
        }`}
        style={{ background: dot }}
      />
      <span className="whitespace-nowrap">{text}</span>
    </span>
  );
}
