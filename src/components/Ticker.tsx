"use client";

import { fmt, priceMove, type Signal } from "@/lib/signals";
import Sprite from "./Sprite";

/** How many ticks ride the tape. Past this it's wallpaper, not information. */
const MAX_TICKS = 24;

/**
 * The tape: the roof of the band. Ambient, not sticky — it sets the tone on
 * arrival and then scrolls away rather than competing with the numbers you're
 * actually reading. Pauses on hover, and doesn't run at all under
 * prefers-reduced-motion (see globals.css).
 *
 * Each tick reads like a news ticker — name, price, then the move in gp and
 * percent. Only rows whose `series` is a genuine price history over time can
 * state a move (see `priceMove`), so the tape is built from those and quietly
 * skips the rest instead of printing a direction it can't back up.
 */
export default function Ticker({ rows }: { rows: Signal[] }) {
  const moves = rows
    .map((r) => ({ row: r, move: priceMove(r) }))
    .filter((t): t is { row: Signal; move: NonNullable<ReturnType<typeof priceMove>> } =>
      t.move !== null
    )
    .slice(0, MAX_TICKS);

  if (moves.length === 0) return null;

  // Duplicated once so the -50% translate loops seamlessly.
  const ticks = [...moves, ...moves];

  return (
    <div className="group overflow-hidden border-b border-[var(--band-line)]">
      <div className="flex w-max animate-[lotus-tape_100s_linear_infinite] gap-[var(--s6)] py-2 group-hover:[animation-play-state:paused]">
        {ticks.map(({ row, move }, i) => {
          const rising = move.abs >= 0;
          const sign = rising ? "+" : "−";
          return (
            <span
              key={`${row.id}-${i}`}
              title={`${row.name} — ${sign}${fmt(Math.abs(move.abs))} gp vs. ${move.from}`}
              className="tnum flex items-center gap-2 whitespace-nowrap text-[12px] text-band-mute"
            >
              <Sprite name={row.name} size={15} />
              <span>{row.name}</span>
              <b className="font-normal text-band-ink">{fmt(row.price)}</b>
              <span
                className="flex items-center gap-1"
                style={{ color: rising ? "var(--band-up)" : "var(--band-down)" }}
              >
                <span>{rising ? "▲" : "▼"}</span>
                <span>
                  {sign}
                  {fmt(Math.abs(move.abs))}
                </span>
                <span>
                  ({sign}
                  {Math.abs(move.pct).toFixed(1)}%)
                </span>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
