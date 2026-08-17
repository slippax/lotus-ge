/**
 * items trading below their 24h average.
 *
 * knows nothing about http - no status codes, no envelope, no idea which
 * version is asking. both dip routes call buildDips() and get the same object,
 * they just wrap it differently (render.ts).
 */

import { fetchSummary } from "@/lib/upstream";
import type { Payload } from "@/lib/render";

/**
 * only what the collector actually knows. dipped-items.json gives five fields
 * per item (ItemName, LowPrice, AvgLow, BuyLimit, pctROI) and everything here
 * is one of those or arithmetic on them.
 *
 * the old shape had 25 fields. the other 17 were placeholders served as
 * analysis - see toLegacyDip below.
 */
export interface DipOpportunity {
  name: string;

  /** Cheapest current buy offer, gp. */
  currentLow: number;
  /** 24-hour mean of the low price, gp - the thing being dipped below. */
  avg24hLow: number;

  /** avg24hLow − currentLow, gp. How far below the mean it's trading. */
  dipMagnitude: number;

  /** GE buy limit per 4 hours. */
  buyLimit: number;
  /** Per-unit gain if it returns to the 24h mean, gp. Same as dipMagnitude. */
  potentialProfit: number;
  /** potentialProfit x buyLimit - the ceiling on one 4-hour window, gp. */
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
  // the analysis happens in collect.py - this just renames its output and
  // derives the three money figures.
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
 * pads a dip back out to the 25-field pre-v1 shape. everything this adds is
 * made up, which is the point - the old response promised these fields and
 * clients may be reading them. keeping the invention here means the analysis
 * upstream gets to be honest without breaking anyone.
 *
 * three flavours of made up:
 *   - constants posing as measurements (volume24hTotal: 1000, riskScore: 2).
 *     we have no volume or risk data at all.
 *   - real values under the wrong name. currentHigh is the low price, avg1hLow
 *     and avg5mLow are both the 24h mean. worse than the constants because they
 *     move and look computed.
 *   - fields that were always empty. id was `item.id || 0` and the collector
 *     emits no id, so it's been 0 for every item ever served.
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

/** throws a 503 if the upstream won't answer. never an empty list. */
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
