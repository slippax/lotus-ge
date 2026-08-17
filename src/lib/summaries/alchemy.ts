/**
 * items trading below what high alchemy pays for them.
 * http-free and version-blind, see dips.ts for why.
 */

import { fetchSummary } from "@/lib/upstream";
import type { Payload } from "@/lib/render";

/**
 * only what the collector knows. alchemy-floors.json gives ItemName, LowPrice,
 * PriceFloor, BuyLimit, pctROI - PriceFloor is already net of costs.
 *
 * dropped from v1, kept in toLegacyAlchemy: an invented three-level risk model,
 * a hardcoded natureRuneCost, a tax from an assumed rate PriceFloor may already
 * include, and alchPrice which was just priceFloor again.
 */
export interface AlchemyOpportunity {
  name: string;

  /** cheapest current buy offer, gp. */
  currentLow: number;
  /** what alching nets after costs, gp. from collect.py. */
  priceFloor: number;

  /** ge buy limit per 4h. */
  buyLimit: number;
  /** priceFloor − currentLow, gp. */
  potentialProfit: number;
  /** return on the buy price, %. from collect.py. */
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
 * same idea as toLegacyDip, see there.
 *
 * needs `index` because the old id was positional (alchemy-0, alchemy-1...) -
 * it identified a row's slot in one response, not an item, so the same item
 * could get a different id next request. frontend never used it anyway.
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

/** static prose the old response carried under `metadata`. docs, not data. */
export const LEGACY_METADATA = {
  description:
    "High alchemy opportunities using VeryGranular research methodology",
  strategy: "Buy items below alch value, high alch for guaranteed profit",
  riskLevel: "Low - guaranteed profit from NPCs",
  methodology: "VeryGranular",
};

/** throws a 503 if the upstream won't answer. never an empty list. */
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
