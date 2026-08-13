"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PriceChart, { type ChartPoint, type HoveredPoint } from "./PriceChart";
import Sprite from "./Sprite";
import { fmt } from "@/lib/signals";

/**
 * Price history for one item, over the list.
 *
 * The states here exist because the API distinguishes them. That is the whole
 * payoff of the route work: a blank chart used to be the only possible
 * rendering of four different situations, and now each one says what happened.
 *
 *   200 with points   -> the chart
 *   200 with none     -> a real item nobody traded in this window
 *   404               -> no such item
 *   503               -> the wiki is unreachable; retrying is worthwhile
 */

const RANGES = [
  { key: "1d", label: "1D" },
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "1y", label: "1Y" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

interface HistoryResponse {
  itemId: number;
  name: string;
  range: string;
  points: ChartPoint[];
}

type State =
  | { status: "loading" }
  | { status: "ready"; data: HistoryResponse }
  | { status: "empty" }
  | { status: "missing" }
  | { status: "upstream" }
  | { status: "error"; message: string };

export default function HistoryModal({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const [range, setRange] = useState<RangeKey>("1w");
  const [state, setState] = useState<State>({ status: "loading" });
  const [hover, setHover] = useState<HoveredPoint | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  /*
   * A real <dialog>, opened with showModal().
   *
   * The browser then handles what a modal has to get right and what we'd
   * otherwise hand-roll badly: Tab is trapped inside, focus returns to the row
   * that opened it on close, the content behind is inert to screen readers,
   * Esc closes, and the whole thing renders in the top layer — above every
   * stacking context on the page, so no portal and no z-index arithmetic.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) dialog.showModal();

    // The list behind stays put while the chart is open. showModal() does not
    // lock scrolling — the top layer is the only thing it gives you for free.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };

    /*
     * Note what this cleanup deliberately does NOT do: call dialog.close().
     *
     * close() dispatches a real `close` event, which runs the onClose handler,
     * which unmounts this component — so closing on cleanup means the effect's
     * own teardown destroys the modal. StrictMode makes it obvious (mount,
     * cleanup, mount => the dialog opened and killed itself), but it would be
     * wrong regardless. Removing the element from the DOM takes it out of the
     * top layer on its own.
     */
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });

      try {
        // Our summaries carry names, not ids, so identity is resolved first.
        // Cached for a day upstream, so this is free after the first click.
        const lookup = await fetch(
          `/api/v1/items?name=${encodeURIComponent(name)}`,
        );
        const found: { items: Array<{ id: number }> } = await lookup.json();

        if (cancelled) return;

        // An empty collection is a successful answer here — it means we hold a
        // name the wiki doesn't know, which is our data problem, not an outage.
        if (!found.items?.length) {
          setState({ status: "missing" });
          return;
        }

        const res = await fetch(
          `/api/v1/items/${found.items[0].id}/history?range=${range}`,
        );

        if (cancelled) return;

        if (res.status === 404) {
          setState({ status: "missing" });
          return;
        }
        if (res.status === 503) {
          setState({ status: "upstream" });
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setState({
            status: "error",
            message: body?.error?.message ?? "Something went wrong.",
          });
          return;
        }

        const data: HistoryResponse = await res.json();

        // Distinguishable at last: the item is real, the window is just quiet.
        if (!data.points.some((p) => p.low !== null)) {
          setState({ status: "empty" });
          return;
        }

        setState({ status: "ready", data });
      } catch {
        if (!cancelled) {
          setState({ status: "upstream" });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [name, range]);

  /**
   * The header reads the hovered point, falling back to the latest one.
   *
   * Percent change is always measured from the start of the visible window, so
   * it answers "what has it done over this range" rather than drifting as the
   * pointer moves.
   */
  const readout = useMemo(() => {
    const points = state.status === "ready" ? state.data.points : [];
    if (!points.length) return null;

    const first = points.find((p) => p.low !== null);
    const last = points.findLast((p) => p.low !== null);
    if (!first || !last) return null;

    const value = hover ? hover.value : (last.low as number);
    const at = new Date((hover ? hover.t : last.t) * 1000);
    const base = first.low as number;

    // Matches the dashed reference line the chart draws. Stated here rather
    // than labelled on the plot, where the badge covered the latest prices.
    const withPrice = points.filter((p) => p.low !== null);
    const mean = Math.round(
      withPrice.reduce((sum, p) => sum + (p.low as number), 0) /
        withPrice.length,
    );

    return {
      value,
      at,
      mean,
      delta: base ? ((value - base) / base) * 100 : null,
      live: hover === null,
    };
  }, [state, hover]);

  const onHover = useCallback((p: HoveredPoint | null) => setHover(p), []);

  /*
   * UTC, deliberately, and labelled as such on the intraday view.
   *
   * The chart's own axis renders in UTC, and the underlying data is UTC-native
   * — the 24h buckets are UTC midnight boundaries. Formatting this readout in
   * the browser's local zone made the header say 08:40 while the axis directly
   * below it said 12:40 for the same point. Two correct clocks disagreeing is
   * worse than one clock the reader has to translate.
   */
  const dateFormat: Intl.DateTimeFormatOptions =
    range === "1d"
      ? {
          hour: "2-digit",
          minute: "2-digit",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
          timeZoneName: "short",
        }
      : {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        };

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Price history for ${name}`}
      // Fires for Esc and for close() alike, so there is one exit path.
      onClose={onClose}
      className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-[rgba(16,14,10,0.55)] backdrop:backdrop-blur-[2px]"
    >
      <div
        className="flex h-full items-end justify-center sm:items-center sm:p-[var(--s4)]"
        // Clicking the space around the card closes it. The card itself stops
        // propagation, so this only ever fires on the backdrop area.
        onClick={() => dialogRef.current?.close()}
        role="presentation"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[760px] rounded-t-md border border-line-hi bg-surface p-[var(--s5)] shadow-2xl sm:rounded-md"
        >
          <div className="flex items-start justify-between gap-[var(--s4)]">
            <div className="flex min-w-0 items-center gap-[var(--s3)]">
              <Sprite name={name} size={32} />
              <div className="min-w-0">
                <h2 className="truncate text-[17px] font-medium tracking-[-0.012em]">
                  {name}
                </h2>
                <p className="text-[12.5px] text-dim">
                  {readout?.live === false ? "At cursor" : "Latest buy price"}
                </p>
              </div>
            </div>

            <button
              type="button"
              // The dialog's own close() so every exit — button, Esc, backdrop —
              // runs through the same `onClose` event and restores focus.
              onClick={() => dialogRef.current?.close()}
              aria-label="Close"
              className="shrink-0 cursor-pointer rounded-sm border border-line-hi px-2 py-1 text-[13px] text-muted transition-colors hover:border-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
            >
              Esc
            </button>
          </div>

          {/* The readout is a fixed slot, not a floating tooltip: nothing moves
            under the pointer and nothing collides on a narrow screen. */}
          <div className="mt-[var(--s4)] flex min-h-[52px] items-baseline gap-[var(--s3)]">
            {readout ? (
              <>
                <span className="tnum text-[28px] leading-none tracking-[-0.02em]">
                  {fmt(readout.value)}
                </span>
                <span className="text-[13px] text-dim">gp</span>
                {readout.delta !== null && (
                  <span
                    className={`tnum text-[14px] ${readout.delta >= 0 ? "text-up" : "text-down"}`}
                  >
                    {readout.delta >= 0 ? "+" : ""}
                    {readout.delta.toFixed(1)}%
                  </span>
                )}
                <span className="ml-auto flex items-baseline gap-[var(--s3)] text-[12.5px] text-muted">
                  <span className="tnum text-dim">
                    avg {readout.mean.toLocaleString()}
                  </span>
                  <span aria-live="polite">
                    {readout.at.toLocaleDateString(undefined, dateFormat)}
                  </span>
                </span>
              </>
            ) : (
              <span className="text-[13.5px] text-dim">&mdash;</span>
            )}
          </div>

          <div className="mt-[var(--s3)] min-h-[300px]">
            {state.status === "ready" && (
              <PriceChart
                points={state.data.points}
                intraday={range === "1d"}
                onHover={onHover}
              />
            )}

            {state.status === "loading" && (
              <Message>Loading price history&hellip;</Message>
            )}

            {state.status === "empty" && (
              <Message>
                No trades recorded in this window. Try a longer range.
              </Message>
            )}

            {state.status === "missing" && (
              <Message>
                We don&rsquo;t have an item id for &ldquo;{name}&rdquo; &mdash;
                no history to show.
              </Message>
            )}

            {state.status === "upstream" && (
              <Message>
                Couldn&rsquo;t reach the OSRS price API. This is usually brief.
                <button
                  type="button"
                  onClick={() => setRange((r) => r)}
                  className="mt-[var(--s3)] block cursor-pointer rounded-sm border border-line-hi px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-muted hover:text-ink"
                >
                  Retry
                </button>
              </Message>
            )}

            {state.status === "error" && <Message>{state.message}</Message>}
          </div>

          <div className="mt-[var(--s4)] flex gap-[var(--s2)] border-t border-line pt-[var(--s4)]">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
                className={`shrink-0 cursor-pointer whitespace-nowrap rounded-sm border px-3 py-1.5 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] ${
                  range === r.key
                    ? "border-gold bg-gold-soft text-gold"
                    : "border-line-hi text-muted hover:border-muted hover:text-ink"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </dialog>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center px-[var(--s4)] text-center text-[13.5px] text-muted">
      {children}
    </div>
  );
}
