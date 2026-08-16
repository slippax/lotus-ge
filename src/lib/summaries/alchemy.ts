/**
 * Alchemy floors: items trading below what high alchemy pays for them.
 *
 * HTTP-free, version-blind. See `src/lib/summaries/dips.ts` for why.
 */

import { fetchSummary } from "@/lib/upstream";
import type { Payload } from "@/lib/render";

export interface AlchemyOpportunity {
  id: string;
  name: string;
  members: boolean;
  icon: string;

  currentLow: number;
  priceFloor: number;

  buyLimit: number;
  potentialProfit: number;
  roi: number;

  alchPrice: number;
  natureRuneCost: number;
  tax: number;

  liquidityRisk: number;
  capitalRisk: number;
  overallRisk: number;
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
  // Data is already processed by the database system using VeryGranular methodology
  // Just format it for the API response with OSRS number formatting
  return data.map((item, index) => ({
    id: `alchemy-${index}`,
    name: item.ItemName || "Unknown Item",
    members: true, // Default to members
    icon: "",

    // Current state (from database analysis)
    currentLow: item.LowPrice || 0,
    priceFloor: item.PriceFloor || 0,

    // Trading metrics (from database)
    buyLimit: item.BuyLimit || 0,
    potentialProfit: (item.PriceFloor || 0) - (item.LowPrice || 0),
    roi: item.pctROI || 0,

    // Alchemy specific
    alchPrice: item.PriceFloor || 0, // Price floor is the alch value minus costs
    natureRuneCost: 170, // Approximate
    tax: Math.floor((item.PriceFloor || 0) * 0.01),

    // Risk assessment (simplified)
    liquidityRisk: 1,
    capitalRisk: (item.LowPrice || 0) > 1000000 ? 2 : 1,
    overallRisk: 2,
  }));
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
