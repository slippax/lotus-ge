/**
 * Dip detection: items trading below their 24-hour average.
 *
 * This file is the *answer*. It knows nothing about HTTP — no status codes, no
 * headers, no envelope, and above all no idea which API version is asking. Both
 * `/api/v1/dip-detection` and `/api/osrs/dip-detection` call `buildDips()` and
 * get the identical object; they differ only in how they dress it for the wire
 * (see `src/lib/render.ts`).
 *
 * That separation is what makes two live versions cheap. The moment this
 * function needs to know who's calling, the versions have forked for real.
 */

import { fetchSummary } from "@/lib/upstream";
import type { Payload } from "@/lib/render";

/**
 * A dip, containing only what the collector actually knows.
 *
 * `dipped-items.json` gives us five fields per item — `ItemName`, `LowPrice`,
 * `AvgLow`, `BuyLimit`, `pctROI` — and everything below is one of those or
 * arithmetic over them. Nothing here is invented.
 *
 * The pre-v1 shape had 25 fields. The other 17 were placeholders served as
 * analysis: hardcoded volumes, a constant `riskScore`, and — worse — real
 * values relabelled as something they weren't (`currentHigh` was the *low*
 * price; `avg1hLow` and `avg5mLow` were both the 24-hour mean). Those are
 * gone from v1 and preserved in `toLegacyDip` below, which is where a promise
 * we already made belongs.
 */
export interface DipOpportunity {
  name: string;

  /** Cheapest current buy offer, gp. */
  currentLow: number;
  /** 24-hour mean of the low price, gp — the thing being dipped below. */
  avg24hLow: number;

  /** avg24hLow − currentLow, gp. How far below the mean it's trading. */
  dipMagnitude: number;

  /** GE buy limit per 4 hours. */
  buyLimit: number;
  /** Per-unit gain if it returns to the 24h mean, gp. Same as dipMagnitude. */
  potentialProfit: number;
  /** potentialProfit × buyLimit — the ceiling on one 4-hour window, gp. */
  maxProfit4h: number;
  /** Net return after GE tax if it recovers, %. Computed by collect.py. */
  roi: number;
}

interface RawDipData {
  id?: number;
  ItemName?: string;
  LowPrice?: number;
  AvgLow?: number;
  BuyLimit?: number;
  pctROI?: number;
}

function processDipData(data: RawDipData[]): DipOpportunity[] {
  // The analysis itself happens in collect.py; this maps its output onto our
  // field names and derives the three money figures from it.
  return data.map((item) => {
    const currentLow = item.LowPrice || 0;
    const avg24hLow = item.AvgLow || 0;
    const buyLimit = item.BuyLimit || 0;
    const gap = avg24hLow - currentLow;

    return {
      name: item.ItemName || "Unknown Item",
      currentLow,
      avg24hLow,
      dipMagnitude: gap,
      buyLimit,
      potentialProfit: gap,
      maxProfit4h: gap * buyLimit,
      roi: item.pctROI || 0,
    };
  });
}

/**
 * Expands an honest dip back into the 25-field pre-v1 shape.
 *
 * **Everything this function adds is fiction, and that is the point.** The old
 * response promised these fields, clients may read them, and a contract isn't
 * one if you edit it when it gets embarrassing. Keeping the invention *here* —
 * in the legacy layer, named for what it is — means the analysis upstream can
 * be honest without breaking anyone.
 *
 * Three kinds of fiction, worth telling apart:
 *
 *   1. **Constants dressed as measurements** — `volume24hTotal: 1000`,
 *      `riskScore: 2`. We have no volume or risk data at all.
 *   2. **Real values under false names** — `currentHigh` is the *low* price;
 *      `avg1hLow` and `avg5mLow` are both the 24-hour mean. More dangerous
 *      than the constants, because they move and look computed.
 *   3. **Fields that were always empty** — `id` was `item.id || 0` and the
 *      collector emits no id, so it was 0 for every item ever served.
 */
export function toLegacyDip(d: DipOpportunity) {
  return {
    id: 0,
    name: d.name,
    members: true,
    icon: "",

    currentLow: d.currentLow,
    currentHigh: d.currentLow,

    avg24hLow: d.avg24hLow,
    avg1hLow: d.avg24hLow,
    avg5mLow: d.avg24hLow,

    dipMagnitude: d.dipMagnitude,
    dipMagnitudePercent: d.roi,
    dipRecency: 0,
    dipRecencyPercent: 0,

    volume24hTotal: 1000,
    volume1hTotal: 100,
    volume5mTotal: 10,
    volumeSurge: 1,

    buyLimit: d.buyLimit,
    potentialProfit: d.potentialProfit,
    maxProfit4h: d.maxProfit4h,
    roi: d.roi,

    historicalSupport: true,
    volumeConsistency: 0.8,
    riskScore: 2,
  };
}

/** Throws `AppError` (503) if the upstream won't answer — never an empty list. */
export async function buildDips(
  requestId: string
): Promise<Payload<DipOpportunity>> {
  const result = await fetchSummary<RawDipData>(
    "dipped-items.json",
    "dip data",
    requestId
  );

  const data = processDipData(result.items);

  return { data, updated: result.updated, count: data.length };
}
