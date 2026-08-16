/**
 * Alchemy floors: items trading below what high alchemy pays for them.
 *
 * HTTP-free, version-blind. See `src/lib/summaries/dips.ts` for why.
 */

import { fetchSummary } from "@/lib/upstream";
import type { Payload } from "@/lib/render";

/**
 * An alchemy floor, containing only what the collector actually knows.
 *
 * `alchemy-floors.json` gives us `ItemName`, `LowPrice`, `PriceFloor`,
 * `BuyLimit`, `pctROI`. `PriceFloor` is already the alch value net of costs,
 * computed upstream in collect.py.
 *
 * Dropped from v1 and preserved in `toLegacyAlchemy`: a three-level risk model
 * with invented thresholds, a hardcoded `natureRuneCost: 170`, a `tax` derived
 * from an assumed rate that `PriceFloor` may already account for, and
 * `alchPrice`, which was just `priceFloor` under a second name.
 */
export interface AlchemyOpportunity {
  name: string;

  /** Cheapest current buy offer, gp. */
  currentLow: number;
  /** What high alchemy nets for it after costs, gp. From collect.py. */
  priceFloor: number;

  /** GE buy limit per 4 hours. */
  buyLimit: number;
  /** priceFloor − currentLow, gp. */
  potentialProfit: number;
  /** Return on the buy price, %. Computed by collect.py. */
  roi: number;
}

interface RawAlchemyData {
  id?: number;
  ItemName?: string;
  LowPrice?: number;
  PriceFloor?: number;
  BuyLimit?: number;
  pctROI?: number;
}

function processAlchemyData(data: RawAlchemyData[]): AlchemyOpportunity[] {
  return data.map((item) => {
    const currentLow = item.LowPrice || 0;
    const priceFloor = item.PriceFloor || 0;

    return {
      name: item.ItemName || "Unknown Item",
      currentLow,
      priceFloor,
      buyLimit: item.BuyLimit || 0,
      potentialProfit: priceFloor - currentLow,
      roi: item.pctROI || 0,
    };
  });
}

/**
 * Expands an honest alchemy row back into the pre-v1 shape.
 *
 * Same principle as `toLegacyDip` — see that function for why the invention
 * lives in the legacy layer rather than being deleted outright.
 *
 * `index` is required because the old `id` was positional (`alchemy-0`,
 * `alchemy-1`, …). It identified a row's place in one response, not an item —
 * two requests could give the same item a different id. Note that the frontend
 * never used it; it builds its own keys.
 */
export function toLegacyAlchemy(a: AlchemyOpportunity, index: number) {
  return {
    id: `alchemy-${index}`,
    name: a.name,
    members: true,
    icon: "",

    currentLow: a.currentLow,
    priceFloor: a.priceFloor,

    buyLimit: a.buyLimit,
    potentialProfit: a.potentialProfit,
    roi: a.roi,

    alchPrice: a.priceFloor,
    natureRuneCost: 170,
    tax: Math.floor(a.priceFloor * 0.01),

    liquidityRisk: 1,
    capitalRisk: a.currentLow > 1000000 ? 2 : 1,
    overallRisk: 2,
  };
}

/**
 * The static prose the pre-v1 response carried in a `metadata` block.
 *
 * Kept only so the legacy route can keep emitting it byte-for-byte. It's
 * documentation, not data — v1 leaves it out.
 */
export const LEGACY_METADATA = {
  description:
    "High alchemy opportunities using VeryGranular research methodology",
  strategy: "Buy items below alch value, high alch for guaranteed profit",
  riskLevel: "Low - guaranteed profit from NPCs",
  methodology: "VeryGranular",
};

/** Throws `AppError` (503) if the upstream won't answer — never an empty list. */
export async function buildAlchemy(
  requestId: string
): Promise<Payload<AlchemyOpportunity>> {
  const result = await fetchSummary<RawAlchemyData>(
    "alchemy-floors.json",
    "alchemy floors",
    requestId
  );

  const data = processAlchemyData(result.items);

  return { data, updated: result.updated, count: data.length };
}
