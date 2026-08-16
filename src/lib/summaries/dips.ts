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

export interface DipOpportunity {
  id: number;
  name: string;
  members: boolean;
  icon: string;

  // Current state
  currentLow: number;
  currentHigh: number;

  // Historical context
  avg24hLow: number;
  avg1hLow: number;
  avg5mLow: number;

  // Dip metrics
  dipMagnitude: number; // Current low vs 24h average
  dipMagnitudePercent: number; // Percentage drop
  dipRecency: number; // How recent the dip is (1h vs current)
  dipRecencyPercent: number; // Percentage of recent drop

  // Volume analysis
  volume24hTotal: number;
  volume1hTotal: number;
  volume5mTotal: number;
  volumeSurge: number; // Recent volume vs average

  // Trading metrics
  buyLimit: number;
  potentialProfit: number; // Expected profit per unit
  maxProfit4h: number; // Max profit in 4h window
  roi: number; // Return on investment %

  // Risk assessment
  historicalSupport: boolean; // Price supported by history
  volumeConsistency: number; // Volume trading consistency
  riskScore: number; // Overall risk (lower = better)
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
  // Data is already processed by the database system using VeryGranular methodology
  // Just format it for the API response
  return data.map((item) => ({
    id: item.id || 0,
    name: item.ItemName || "Unknown Item",
    members: true, // Default to members
    icon: "",

    // Current state (from database analysis)
    currentLow: item.LowPrice || 0,
    currentHigh: item.LowPrice || 0, // Will be updated when we have high price data

    // Historical context (from VeryGranular analysis)
    avg24hLow: item.AvgLow || 0,
    avg1hLow: item.AvgLow || 0, // Simplified for now
    avg5mLow: item.AvgLow || 0, // Simplified for now

    // Dip metrics (calculated by database)
    dipMagnitude: (item.AvgLow || 0) - (item.LowPrice || 0),
    dipMagnitudePercent: item.pctROI || 0,
    dipRecency: 0, // Will be calculated when we have more granular data
    dipRecencyPercent: 0,

    // Volume analysis (simplified for now)
    volume24hTotal: 1000, // Default volume
    volume1hTotal: 100,
    volume5mTotal: 10,
    volumeSurge: 1,

    // Trading metrics (from database)
    buyLimit: item.BuyLimit || 0,
    potentialProfit: (item.AvgLow || 0) - (item.LowPrice || 0),
    maxProfit4h:
      ((item.AvgLow || 0) - (item.LowPrice || 0)) * (item.BuyLimit || 0),
    roi: item.pctROI || 0,

    // Risk assessment (simplified)
    historicalSupport: true,
    volumeConsistency: 0.8,
    riskScore: 2,
  }));
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
