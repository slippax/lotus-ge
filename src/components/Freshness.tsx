"use client";

import { useEffect, useState } from "react";
import { isStale, timeAgo } from "@/lib/signals";

type State = "loading" | "live" | "error";

/**
 * how current the prices are. first thing worth knowing on a market page, and
 * it used to sit under the list where nobody looked. the dot carries the state
 * for a glance, the text carries the detail.
 *
 * re-renders on a timer so "2m ago" doesn't quietly become a lie on an open tab.
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
    // pill not bare text - it sits next to the 32px round theme toggle, and
    // matching height and border makes them read as one cluster.
    <span
      className="flex h-8 items-center gap-2 rounded-full border border-[var(--band-line)] px-3 text-[12.5px] text-band-mute"
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
