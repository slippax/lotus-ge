"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioSystem } from "@/lib/audio";
import Masthead from "@/components/Masthead";
import Freshness from "@/components/Freshness";
import Ticker from "@/components/Ticker";
import Lede from "@/components/Lede";
import SignalList from "@/components/SignalList";
import {
  fromAlch,
  fromBreakout,
  fromConfluence,
  fromCraft,
  fromDip,
  fromVolume,
  availableSorts,
  KIND_FILTER,
  SORT_LABEL,
  sortSignals,
  type Signal,
  type SignalKind,
  type SortKey,
} from "@/lib/signals";

type Filter = "all" | SignalKind;

/** Each endpoint, with the normaliser that turns it into a Signal. */
const SOURCES = [
  { path: "dip-detection", map: fromDip },
  { path: "alchemy-floors", map: fromAlch },
  { path: "volatility-breakout", map: fromBreakout },
  { path: "confluence", map: fromConfluence },
  { path: "volume-profile", map: fromVolume },
  { path: "recipe-arbitrage", map: fromCraft },
] as const;

const KIND_ORDER: SignalKind[] = [
  "dip",
  "breakout",
  "alch",
  "craft",
  "confluence",
  "volume",
];

export default function AnalyticsPage() {
  const [rows, setRows] = useState<Signal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Feeds that failed while others succeeded — a partial view, said out loud. */
  const [degraded, setDegraded] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [filter, setFilter] = useState<Filter>("dip");
  // Return is the only metric comparable across signal kinds. Ceiling scales
  // with how expensive an item is, so sorting by it just ranks capital.
  const [sort, setSort] = useState<SortKey>("roi");

  /**
   * @param version When new data lands we need to bypass the CDN's 60-second
   *   window. The obvious way is `?t=${Date.now()}` — and it's a trap: every
   *   client gets a *different* URL, so none of them share a cache entry and
   *   the refresh costs one upstream call per connected client, at exactly the
   *   moment they all ask at once. The ntfy message id is the same string for
   *   every subscriber, so all clients compute one URL: the first through pays,
   *   the rest hit cache, and everyone sees the new data just as fast.
   */
  const fetchData = useCallback(async (version?: string) => {
    /*
     * allSettled, not all. Six independent upstream reads: one of them 503ing
     * is no reason to throw away the five that answered. `all` rejects on the
     * first failure and we'd blank a working page over one bad feed.
     */
    const results = await Promise.allSettled(
      SOURCES.map(async ({ path, map }) => {
        const res = await fetch(
          `/api/osrs/${path}${version ? `?v=${encodeURIComponent(version)}` : ""}`
        );

        // A non-2xx is a real failure — never fold it into an empty list.
        if (!res.ok) throw new Error(`${path} returned ${res.status}`);

        const body = await res.json();
        return {
          path,
          signals: map(body.data ?? []),
          updated: body.dataUpdated as string | undefined,
        };
      })
    );

    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const failed = SOURCES.filter((s) => !ok.some((o) => o.path === s.path));

    failed.forEach((s, i) => {
      const rejection = results.find((r) => r.status === "rejected");
      console.error(`Analytics fetch failed: ${s.path}`, i === 0 ? rejection : "");
    });

    // Every feed down is the one case where we genuinely know nothing, and it
    // has to stay distinguishable from a quiet market.
    if (ok.length === 0) {
      setError(
        results[0]?.status === "rejected"
          ? String((results[0] as PromiseRejectedResult).reason)
          : "Unknown error"
      );
      return;
    }

    setRows(ok.flatMap((r) => r.signals));
    const newest = ok
      .map((r) => (r.updated ? new Date(r.updated).getTime() : 0))
      .reduce((a, b) => Math.max(a, b), 0);
    setUpdatedAt(newest ? new Date(newest) : new Date());
    setError(null);
    // Named, not counted: "volume-profile is missing" is actionable, "5 of 6
    // loaded" leaves the reader wondering which numbers they can trust.
    setDegraded(failed.map((s) => s.path));

    if (version) audioSystem.playDataRefreshSound();
  }, []);

  useEffect(() => {
    fetchData();

    // Instant updates: the collector pings ntfy.sh when new data lands.
    const source = new EventSource("https://ntfy.sh/osrs-ge-lotus-updates/sse");
    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        // parsed.id is ntfy's message id: one value, delivered identically to
        // every subscriber. That shared-ness is the whole point — see fetchData.
        if (parsed.message === "refresh") fetchData(parsed.id ?? String(parsed.time));
      } catch {
        if (event.data === "refresh") fetchData();
      }
    };
    return () => source.close();
  }, [fetchData]);

  const counts = useMemo(() => {
    const c: Partial<Record<SignalKind, number>> = {};
    (rows ?? []).forEach((r) => (c[r.kind] = (c[r.kind] ?? 0) + 1));
    return c;
  }, [rows]);

  /*
   * Dips is the landing view, but it's also the only filter that's routinely
   * empty — a quiet market produces none, and the chip for a kind with no rows
   * isn't rendered at all. Defaulting there unconditionally would strand you on
   * "Nothing worth buying right now" with no visible tab to leave by, which
   * reads as broken rather than as a quiet market. So the fallback to All runs
   * once, on the first load, and never fights a filter you chose yourself.
   */
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || rows === null) return;
    defaulted.current = true;
    if (!counts.dip) setFilter("all");
  }, [rows, counts.dip]);

  /*
   * The list is ranked, so it grows rather than paginating: nobody looks for
   * page 4 of "best opportunities", and numbered pages would chop the ranking
   * into chunks. Rendering all ~190 rows at once is mostly a DOM and SVG cost
   * — sprites are lazy — but there's no reason to pay it before it's asked for.
   */
  const PAGE = 25;
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return filter === "all" ? rows : rows.filter((r) => r.kind === filter);
  }, [rows, filter]);

  const sorts = useMemo(() => availableSorts(filtered), [filtered]);

  /*
   * `sort` is what the reader asked for; this is what the current rows can
   * actually do. Breakout and confluence publish no return, so "Best return"
   * can't apply there and we fall back to the order the analysis produced
   * rather than leaving a control that silently does nothing.
   *
   * The fallback is derived, never written back to state. Clamping `sort`
   * itself was one-way — visiting breakout demoted it to "ranked" and nothing
   * ever restored it, so coming back to dips silently re-sorted the list and
   * the Lede headlined a different item than it had a moment earlier.
   */
  const effectiveSort = sorts.includes(sort) ? sort : "ranked";

  // Any change to what's being listed starts the count over.
  useEffect(() => setShown(PAGE), [filter, effectiveSort]);

  const matched = useMemo(
    () => sortSignals(filtered, effectiveSort),
    [filtered, effectiveSort]
  );

  const visible = useMemo(() => matched.slice(0, shown), [matched, shown]);
  const matching = matched.length;

  const isLive = !error && rows !== null && visible.length > 0;

  return (
    <>
      <div className="border-b border-[var(--band-line)] bg-band text-band-ink">
        {/* Ticker picks its own ticks — only rows that can state a real move. */}
        {rows && <Ticker rows={rows} />}
        <div className="mx-auto max-w-[1080px] px-[var(--s5)]">
          <Masthead
            status={
              <Freshness
                updatedAt={updatedAt}
                state={error ? "error" : rows === null ? "loading" : "live"}
              />
            }
          />
          {isLive ? (
            <Lede top={visible[0]} />
          ) : (
            <BandMessage
              title={
                error
                  ? "We can't see the market"
                  : rows === null
                    ? "Reading the Grand Exchange"
                    : "The market is quiet"
              }
            />
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] px-[var(--s5)] pb-[var(--s7)]">
        {rows !== null && !error && (
          <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-ground py-[var(--s3)] sm:py-[var(--s4)]">
            {/*
             * One line, always. Wrapping put three rows of chips above the
             * fold on a phone and pushed the actual list off screen; the chips
             * scroll sideways instead.
             */}
            <ChipStrip>
              <Chip
                active={filter === "all"}
                onClick={() => setFilter("all")}
                label="All"
                count={rows.length}
              />
              {KIND_ORDER.filter((k) => counts[k]).map((k) => (
                <Chip
                  key={k}
                  active={filter === k}
                  onClick={() => setFilter(k)}
                  label={KIND_FILTER[k]}
                  count={counts[k]}
                />
              ))}
            </ChipStrip>

            <div className="flex shrink-0 items-center gap-2 text-[13.5px] text-muted">
              <label htmlFor="sort" className="max-sm:sr-only">
                Sort
              </label>
              <div className="relative">
                <select
                  id="sort"
                  value={effectiveSort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="cursor-pointer appearance-none rounded-sm border border-line-hi bg-transparent py-1.5 pl-3 pr-7 text-[13.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
                >
                  {sorts.map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABEL[k]}
                    </option>
                  ))}
                </select>
                {/* appearance-none strips the native arrow; without one this
                    reads as a label rather than a control on mobile. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-dim"
                >
                  ▼
                </span>
              </div>
            </div>
          </div>
        )}

        {/*
          * A feed that failed is not a feed with nothing in it. Without this
          * line, a 503 on volume-profile looks exactly like "no volume signals
          * today" — the same lie the API used to tell, moved into the UI.
          */}
        {!error && degraded.length > 0 && (
          <div className="mb-[var(--s4)] rounded-sm border border-line-hi px-3 py-2 text-[13.5px] text-muted">
            Showing a partial view — {degraded.join(", ")} didn&apos;t answer.
            These are missing, not empty.
          </div>
        )}

        {error ? (
          <State
            tone="error"
            title="We can't reach the price feed"
            body="The data source didn't answer, so we don't know what the market is doing right now. This is different from an empty market — we'll keep retrying."
            code={error}
          />
        ) : rows === null ? (
          <State title="Loading" body="Fetching the latest Grand Exchange data." />
        ) : visible.length === 0 ? (
          <State
            title="Nothing worth buying right now"
            body="Prices are current and every item was checked — none meet the threshold. Check back after the next update."
          />
        ) : (
          <>
            <SignalList rows={visible} kind={filter} />

            {matching > visible.length && (
              <div className="flex justify-center pt-[var(--s5)]">
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE)}
                  className="cursor-pointer rounded-sm border border-line-hi px-4 py-2 text-[13.5px] font-medium text-muted transition-colors hover:border-gold hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
                >
                  Show {Math.min(PAGE, matching - visible.length)} more
                </button>
              </div>
            )}

          </>
        )}
      </div>
    </>
  );
}

/**
 * The horizontal chip strip.
 *
 * A touch device already scrolls this — a swipe is a scroll. A mouse has no
 * equivalent: the scrollbar is hidden, so on any window narrow enough to
 * overflow there is nothing to grab and the chips past the fade are
 * unreachable. So the drag is implemented here, for mouse pointers only —
 * touch keeps its native momentum scrolling, which is better than anything
 * we'd hand-roll.
 *
 * A drag that ends over a chip is followed by a `click`, so releasing the
 * mouse would otherwise change the filter. `moved` tracks whether the pointer
 * travelled far enough to count as a drag, and the capture-phase handler eats
 * the click if it did — see `end` for why that suppression is on a timer.
 *
 * The wheel is deliberately left alone. This bar is sticky and spans the
 * window, so turning a vertical wheel into a horizontal scroll would freeze
 * the page any time the cursor happened to be resting over it. Shift+wheel
 * already scrolls it horizontally, for free, in every browser.
 *
 * Keyboard needs nothing: the chips are real buttons, so tabbing to one that
 * is off-screen scrolls it into view by itself.
 */
function ChipStrip({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    downX: number;
    originX: number | null;
    left: number;
    moved: boolean;
  } | null>(null);
  const swallowClick = useRef(false);

  /**
   * Which edges have content hidden past them. Doubles as the overflow test:
   * if neither edge can move, everything fits and there is nothing to drag.
   */
  const [edge, setEdge] = useState({ left: false, right: false });
  const overflowing = edge.left || edge.right;

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollWidth - el.clientWidth - el.scrollLeft > 1;
    // Returning `prev` unchanged lets React bail out — this runs on every
    // scroll event, and the answer almost never changes.
    setEdge((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right }
    );
  }, []);

  // Re-measure when the strip is resized.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Deliberately no dependency array: chips arriving changes scrollWidth
  // without changing the box a ResizeObserver watches.
  useEffect(measure);

  const end = () => {
    if (drag.current?.moved) {
      swallowClick.current = true;
      /*
       * The click fires right after this and clears the flag itself. But a
       * drag that ends over a gap, over the sort control, or off the strip
       * entirely produces NO click — and a flag left standing would eat the
       * next real one, making a chip look dead for exactly one press. This
       * timer lands after any click that does arrive, so the suppression can
       * never outlive the gesture that armed it.
       */
      setTimeout(() => (swallowClick.current = false), 0);
    }
    drag.current = null;
  };

  return (
    <div
      ref={ref}
      onScroll={measure}
      onPointerDown={(e) => {
        // Belt and braces with the timer above: a gesture never starts with a
        // suppression left over from the last one.
        swallowClick.current = false;
        if (!overflowing || e.pointerType !== "mouse" || e.button !== 0) return;
        drag.current = { downX: e.clientX, originX: null, left: 0, moved: false };
        // NB: capture is claimed in pointermove, not here. See below.
      }}
      onPointerMove={(e) => {
        const el = ref.current;
        const d = drag.current;
        if (!d || !el) return;

        // Under the threshold this is still a click, not a drag. Nothing moves.
        if (!d.moved) {
          if (Math.abs(e.clientX - d.downX) <= 4) return;
          d.moved = true;

          /*
           * Claim the pointer only now that it's definitely a drag.
           *
           * Capturing on pointerdown breaks every chip. A captured pointer
           * retargets the compatibility mouse events to the capturing element,
           * so mousedown and mouseup both resolve to this div rather than to
           * the button under the cursor — and `click`, which is derived from
           * that pair, fires on the div too. The chip's own onClick never runs.
           * It only showed up in the narrow view because that's the only place
           * `overflowing` is true and the capture happened at all.
           *
           * Claiming it here costs nothing: the first 4px are tracked without
           * capture, and from this point on the gesture is one we suppress the
           * click for anyway.
           */
          el.setPointerCapture(e.pointerId);

          /*
           * Take the baseline here rather than at pointerdown. Pressing a
           * button focuses it, and a chip that is only half visible — exactly
           * the one sitting under the fade — gets scrolled into view by the
           * browser immediately after pointerdown. A baseline captured before
           * that lands is stale by however far the browser moved, and the
           * first frame of the drag jumps by that much.
           */
          d.originX = e.clientX;
          d.left = el.scrollLeft;
          return;
        }

        el.scrollLeft = d.left - (e.clientX - (d.originX ?? d.downX));
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        // Fade only the edges that actually have something behind them, so a
        // sliced chip always reads as "scrolled", never as "clipped".
        maskImage: `linear-gradient(to right, ${
          edge.left ? "transparent, #000 24px" : "#000 0"
        }, ${edge.right ? "#000 calc(100% - 24px), transparent" : "#000 100%"})`,
      }}
      // `-my-1 py-1` keeps focus rings from being clipped by the scroll box.
      className={`-my-1 flex min-w-0 flex-1 select-none gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        overflowing ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 cursor-pointer whitespace-nowrap rounded-sm border px-3 py-1.5 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] ${
        active
          ? "border-gold bg-gold-soft text-gold"
          : "border-line-hi text-muted hover:border-muted hover:text-ink"
      }`}
    >
      {label}
      {count !== undefined && (
        <span
          className={`tnum ml-1.5 text-[12px] ${active ? "text-gold opacity-70" : "text-dim"}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function BandMessage({ title }: { title: string }) {
  return (
    <div className="py-[var(--s5)] pb-[var(--s6)]">
      <h2 className="text-[32px] font-semibold leading-tight tracking-[-0.03em]">
        {title}
      </h2>
    </div>
  );
}

function State({
  title,
  body,
  code,
  tone,
}: {
  title: string;
  body: string;
  code?: string;
  tone?: "error";
}) {
  return (
    <div className="px-[var(--s5)] py-[var(--s7)] text-center">
      <div
        className={`mb-2 text-[17px] font-semibold ${tone === "error" ? "text-down" : ""}`}
      >
        {title}
      </div>
      <p className="mx-auto max-w-[48ch] text-[14.5px] leading-relaxed text-muted">
        {body}
      </p>
      {code && (
        <div className="tnum mt-[var(--s4)] inline-block rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-muted">
          {code}
        </div>
      )}
    </div>
  );
}
