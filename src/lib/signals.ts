/**
 * One shape for every signal.
 *
 * The six endpoints are six different analyses of the same underlying thing:
 * an item, with a reason to care about it. Normalising them here is what lets
 * the UI show one ranked list instead of six tabs the user has to compare in
 * their head.
 *
 * Nothing in here invents numbers. Where an analysis genuinely has no price
 * history, `series` is empty and the UI shows nothing rather than a shape.
 */

export type SignalKind =
  | "dip"
  | "breakout"
  | "alch"
  | "craft"
  | "volume"
  | "confluence";

export interface Signal {
  id: string;
  kind: SignalKind;
  name: string;
  /** What you pay, in gp. */
  price: number;
  /** GE buy limit per 4 hours. */
  limit: number;
  /** Real price points, oldest first. Empty when the analysis has no history. */
  series: number[];
  /** A label per series point, e.g. ["24h avg", "now"]. */
  labels: string[];
  /** Plain-English reason this row is here. No enum strings. */
  why: string;
  /**
   * Net return as a percentage if the thesis plays out. Always a gain — a dip
   * priced below its average is an opportunity, not a loss.
   * `null` where the upstream analysis publishes no real figure.
   */
  roi: number | null;
  /**
   * Best case in gp, assuming you fill the whole buy limit AND sell every unit
   * at the target. A ceiling, not an expectation — named accordingly.
   * `null` where the upstream number is a placeholder rather than a result.
   */
  ceiling: number | null;
  /** Two columns shown when the list is filtered to this kind. */
  detail: [Metric, Metric];
}

/**
 * A kind-specific column. The six analyses don't produce comparable numbers,
 * so when the list is filtered to one kind it shows that kind's own metrics
 * instead of leaving the shared Return/Ceiling columns empty.
 */
export interface Metric {
  k: string;
  v: string;
  tone?: "up" | "down" | "dim";
}

/*
 * Names a player would use, not the names of the analyses that produced them.
 * "Confluence" is our word for it; "Trending" is theirs. Same mistake as
 * naming an endpoint after a process instead of a thing.
 */
export const KIND_LABEL: Record<SignalKind, string> = {
  dip: "Dip",
  breakout: "Breakout",
  alch: "Alching",
  craft: "Crafting",
  volume: "Volume",
  confluence: "Trending",
};

/** Plural, for the filter chips. */
export const KIND_FILTER: Record<SignalKind, string> = {
  dip: "Dips",
  breakout: "Breakouts",
  alch: "Alching",
  craft: "Crafting",
  volume: "Volume",
  confluence: "Trending",
};

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function gp(n: number): string {
  const v = Math.abs(n);
  if (v >= 1e9) return (n / 1e9).toFixed(2) + "b";
  if (v >= 1e6) return (n / 1e6).toFixed(2) + "m";
  if (v >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}

/** Compact, because it sits in the masthead next to the wordmark. */
export function timeAgo(from: Date | null): string {
  if (!from) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - from.getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Prices land every few minutes; anything older than this is worth flagging. */
export function isStale(from: Date | null): boolean {
  if (!from) return true;
  return Date.now() - from.getTime() > 15 * 60 * 1000;
}

/**
 * The move a ticker can honestly print: how far the price has come, and from
 * what.
 *
 * Only two of the six analyses put a price *history* in `series`. A dip runs
 * 24-hour average → now; a trending item runs monthly mean → now. The other
 * four put two different things side by side — what you pay vs. what it alchs
 * for, the low vs. the high, ingredients vs. product. First-to-last there is a
 * gap between two quantities, not a change over time, so printing it as
 * "▲ +12%" would be a lie wearing a ticker's clothes. Those return null and
 * stay off the tape.
 */
export function priceMove(
  s: Signal
): { abs: number; pct: number; from: string } | null {
  if (s.kind !== "dip" && s.kind !== "confluence") return null;
  const then = s.series[0];
  const now = s.series[s.series.length - 1];
  if (!(then > 0) || !(now > 0)) return null;
  return {
    abs: Math.round(now - then),
    pct: ((now - then) / then) * 100,
    from: s.labels[0] ?? "",
  };
}

/* ------------------------------------------------------------------ *
 * Item sprites
 * ------------------------------------------------------------------ */

/**
 * Sprites go through our own route rather than straight to the wiki: 50 rows
 * hotlinking on every page load gets throttled, and the images vanish. The
 * proxy caches for a week. Filename quirks are handled there.
 */
export function spriteUrl(name: string): string {
  return `/api/osrs/sprite?item=${encodeURIComponent(name)}`;
}

/* ------------------------------------------------------------------ *
 * Normalisers — one per endpoint
 * ------------------------------------------------------------------ */

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

type Raw = Record<string, unknown>;

/** Return + Ceiling as metrics, for the kinds that publish both. */
function moneyDetail(roi: number | null, ceiling: number | null): [Metric, Metric] {
  return [
    {
      k: "Return",
      v: roi === null ? "—" : `+${roi.toFixed(1)}%`,
      tone: roi === null ? "dim" : "up",
    },
    { k: "Max profit", v: ceiling === null ? "—" : gp(ceiling), tone: ceiling === null ? "dim" : undefined },
  ];
}

/** VOLUME_CONFIRMED -> Confirmed, LOW_VOLUME -> Thin, etc. */
function humanVolume(raw: string): string {
  if (raw.includes("CONFIRMED")) return "Confirmed";
  if (raw.includes("LOW")) return "Thin";
  if (raw.includes("HIGH")) return "Heavy";
  if (raw.includes("NORMAL")) return "Normal";
  return raw ? raw.toLowerCase().replace(/_/g, " ") : "—";
}

export function fromDip(items: Raw[]): Signal[] {
  return items.map((r, i) => {
    const price = num(r.currentLow);
    const avg = num(r.avg24hLow);
    // How far the price has fallen. Distinct from the return: a drop from 100
    // to 50 is a 50% fall but a 100% gain on the way back.
    const drop = avg > 0 ? ((avg - price) / avg) * 100 : 0;
    return {
      id: `dip-${i}`,
      kind: "dip" as const,
      name: String(r.name ?? "Unknown item"),
      price,
      limit: num(r.buyLimit),
      series: avg > 0 && price > 0 ? [avg, price] : [],
      labels: ["24h average", "now"],
      why: `Trading ${drop.toFixed(1)}% below its 24-hour average of ${fmt(avg)} gp`,
      // collect.py: (dailyMean - low - tax) / low * 100 — the net gain if it
      // recovers, after GE tax. A positive return, not a fall.
      roi: num(r.roi),
      ceiling: num(r.maxProfit4h),
      detail: moneyDetail(num(r.roi), num(r.maxProfit4h)),
    };
  });
}

export function fromAlch(items: Raw[]): Signal[] {
  return items.map((r, i) => {
    const price = num(r.currentLow);
    const floor = num(r.priceFloor);
    const margin = num(r.potentialProfit);
    return {
      id: `alch-${i}`,
      kind: "alch" as const,
      name: String(r.name ?? "Unknown item"),
      price,
      limit: num(r.buyLimit),
      series: price > 0 && floor > 0 ? [price, floor] : [],
      labels: ["buy", "alch value"],
      why: `Alchs for ${fmt(margin)} gp more than it costs`,
      roi: num(r.roi),
      ceiling: margin * num(r.buyLimit),
      detail: moneyDetail(num(r.roi), margin * num(r.buyLimit)),
    };
  });
}

export function fromBreakout(items: Raw[]): Signal[] {
  return items.map((r, i) => {
    const price = num(r.currentPrice);
    const limit = num(r.buyLimit);
    const up = String(r.breakoutDirection ?? "").startsWith("UPPER");
    const compression = num(r.compressionRatio);
    return {
      id: `breakout-${i}`,
      kind: "breakout" as const,
      name: String(r.name ?? "Unknown item"),
      price,
      limit,
      series: [], // ranges, not a price history — nothing honest to draw
      labels: [],
      why: `Trading range has narrowed - ${up ? "poised to rise" : "poised to fall"}`,
      // `potentialBreakoutProfit` is exactly price x buyLimit x 0.1 for every
      // row — a placeholder, not a projection. Showing it as a return would
      // print "+10.0%" against all 50 breakouts. The compression figure in
      // `why` is the real, computed part of this analysis.
      roi: null,
      ceiling: null,
      // The compression figure and the volume check are the real, computed
      // parts of this analysis — they just aren't a return or a profit.
      detail: [
        { k: "Band width", v: `${compression.toFixed(1)}%`, tone: "up" },
        { k: "Volume", v: humanVolume(String(r.volumeConfirmation ?? "")) },
      ],
    };
  });
}

export function fromConfluence(items: Raw[]): Signal[] {
  return items.map((r, i) => {
    const monthly = num(r.monthlyMean);
    const current = num(r.currentPrice);
    const bull = num(r.bullishConfluence);
    const change = monthly > 0 ? ((current - monthly) / monthly) * 100 : 0;
    const series = [
      monthly,
      num(r.weeklyMean),
      num(r.dailyMean),
      num(r.hourlyMean),
      num(r.fiveMinMean),
      current,
    ];
    return {
      id: `confluence-${i}`,
      kind: "confluence" as const,
      name: String(r.name ?? "Unknown item"),
      price: current,
      limit: num(r.buyLimit),
      series: series.every((v) => v > 0) ? series : [],
      labels: ["1 month", "1 week", "1 day", "1 hour", "5 min", "now"],
      why:
        bull >= 5
          ? "Rising across every timeframe we track"
          : `Rising across ${bull} of the five timeframes we track`,
      // Confluence publishes no return. The month-over-month change is real
      // but it is a price move, not a profit — putting it under "Return" would
      // mean that column said different things in different rows. It goes in
      // the reason line instead, and the sparkline carries the shape.
      // `potentialProfit` is the same price x limit x 0.1 placeholder the
      // breakout analysis uses, so there is no honest ceiling either.
      roi: null,
      ceiling: null,
      // A month-over-month move is real but it is a price change, not a
      // profit — it gets its own column rather than sitting under "Return".
      detail: [
        {
          k: "Month change",
          v: `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}%`,
          tone: change >= 0 ? "up" : "down",
        },
        { k: "Timeframes", v: `${bull}/5` },
      ],
    };
  });
}

export function fromVolume(items: Raw[]): Signal[] {
  return items.map((r, i) => {
    const low = num(r.currentPrice);
    const high = num(r.currentHigh);
    const lowVol = num(r.lowPriceVolume);
    const highVol = num(r.highPriceVolume);
    const limit = num(r.buyLimit);
    const accumulation = num(r.accumulationProfit);
    return {
      id: `volume-${i}`,
      kind: "volume" as const,
      name: String(r.name ?? "Unknown item"),
      price: low,
      limit,
      series: low > 0 && high > 0 ? [low, high] : [],
      labels: ["low", "high"],
      why:
        lowVol > highVol
          ? "More trading at the low price than the high"
          : "More trading at the high price than the low",
      roi: low > 0 ? ((high - low) / low) * 100 : 0,
      ceiling: accumulation > 0 ? accumulation : (high - low) * limit,
      detail: [
        {
          k: "Spread",
          v: low > 0 ? `+${(((high - low) / low) * 100).toFixed(1)}%` : "—",
          tone: "up",
        },
        { k: "Traded low / high", v: `${gp(lowVol)} / ${gp(highVol)}` },
      ],
    };
  });
}

export function fromCraft(items: Raw[]): Signal[] {
  return items.map((r, i) => {
    const cost = num(r.totalIngredientCost);
    const sells = num(r.productPrice);
    const perCraft = num(r.profitPerCraft);
    const limit = num(r.productBuyLimit);
    const from = String(r.ingredient1Name ?? "").trim();
    return {
      id: `craft-${i}`,
      kind: "craft" as const,
      name: String(r.productName ?? "Unknown item"),
      price: cost,
      limit,
      series: cost > 0 && sells > 0 ? [cost, sells] : [],
      labels: ["ingredients", "sells for"],
      why: from ? `Made from ${from}` : "Crafted from cheaper inputs",
      roi: num(r.roi),
      ceiling: perCraft * limit,
      detail: moneyDetail(num(r.roi), perCraft * limit),
    };
  });
}

/* ------------------------------------------------------------------ *
 * Sorting
 * ------------------------------------------------------------------ */

export type SortKey = "ranked" | "ceiling" | "roi" | "price";

export const SORT_LABEL: Record<SortKey, string> = {
  ranked: "As ranked",
  ceiling: "Biggest max profit",
  roi: "Best return",
  price: "Cheapest entry",
};

/**
 * Only offer sorts the current rows can actually satisfy.
 *
 * Breakouts and trending items publish no return or profit, so offering
 * "Best return" there is a control that looks like it works and doesn't.
 * "As ranked" keeps whatever order the analysis itself produced.
 */
export function availableSorts(rows: Signal[]): SortKey[] {
  const keys: SortKey[] = ["ranked"];
  if (rows.some((r) => r.roi !== null)) keys.push("roi");
  if (rows.some((r) => r.ceiling !== null)) keys.push("ceiling");
  keys.push("price");
  return keys;
}

/** Rows with no real figure sort last rather than to the top as zeroes. */
function desc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

export function sortSignals(rows: Signal[], key: SortKey): Signal[] {
  if (key === "ranked") return rows;
  const out = [...rows];
  if (key === "ceiling") out.sort((a, b) => desc(a.ceiling, b.ceiling));
  if (key === "roi") out.sort((a, b) => desc(a.roi, b.roi));
  if (key === "price") out.sort((a, b) => a.price - b.price);
  return out;
}
