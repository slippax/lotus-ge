/**
 * items where several timeframe averages agree on direction.
 *
 * http-free and version-blind, see dips.ts for why.
 */

import { fetchSummary } from "@/lib/upstream";
import type { Payload } from "@/lib/render";

export interface ConfluenceOpportunity {
  id: number;
  name: string;
  currentPrice: number;
  buyLimit: number;
  fiveMinMean: number;
  hourlyMean: number;
  dailyMean: number;
  weeklyMean: number;
  monthlyMean: number;
  bullishConfluence: number;
  bearishConfluence: number;
  signalStrength: string;
  volumeConfirmation: string;
  potentialProfit: number;
}

interface RawConfluenceData {
  ItemName?: string;
  CurrentPrice?: number;
  BuyLimit?: number;
  FiveMinMean?: number;
  HourlyMean?: number;
  DailyMean?: number;
  WeeklyMean?: number;
  MonthlyMean?: number;
  BullishConfluence?: number;
  BearishConfluence?: number;
  SignalStrength?: string;
  VolumeConfirmation?: string;
  PotentialProfit?: number;
}

function processConfluenceData(
  data: RawConfluenceData[]
): ConfluenceOpportunity[] {
  // Data is already processed by the database system using VeryGranular methodology
  // Just format it for the API response
  return data.map((item, index) => ({
    id: index + 1,
    name: item.ItemName || "Unknown Item",
    currentPrice: item.CurrentPrice || 0,
    buyLimit: item.BuyLimit || 0,
    fiveMinMean: item.FiveMinMean || 0,
    hourlyMean: item.HourlyMean || 0,
    dailyMean: item.DailyMean || 0,
    weeklyMean: item.WeeklyMean || 0,
    monthlyMean: item.MonthlyMean || 0,
    bullishConfluence: item.BullishConfluence || 0,
    bearishConfluence: item.BearishConfluence || 0,
    signalStrength: item.SignalStrength || "MIXED_SIGNALS",
    volumeConfirmation: item.VolumeConfirmation || "WEAK_VOLUME",
    potentialProfit: item.PotentialProfit || 0,
  }));
}

/** throws a 503 if the upstream won't answer. never an empty list. */
export async function buildConfluence(
  requestId: string
): Promise<Payload<ConfluenceOpportunity>> {
  const result = await fetchSummary<RawConfluenceData>(
    "confluence-analysis.json",
    "confluence analysis",
    requestId
  );

  const data = processConfluenceData(result.items);

  return { data, updated: result.updated, count: data.length };
}
