/**
 * Volatility breakout: items whose trading range has compressed.
 *
 * HTTP-free, version-blind. See `src/lib/summaries/dips.ts` for why.
 */

import { fetchSummary } from "@/lib/upstream";
import type { Payload } from "@/lib/render";

export interface VolatilityOpportunity {
  id: number;
  name: string;
  currentPrice: number;
  buyLimit: number;
  dailyRange: number;
  weeklyRange: number;
  monthlyRange: number;
  compressionRatio: number;
  breakoutDirection: string;
  volumeConfirmation: string;
  potentialBreakoutProfit: number;
  compressionLevel: string;
}

interface RawVolatilityData {
  ItemName?: string;
  CurrentPrice?: number;
  BuyLimit?: number;
  DailyRange?: number;
  WeeklyRange?: number;
  MonthlyRange?: number;
  CompressionRatio?: number;
  BreakoutDirection?: string;
  VolumeConfirmation?: string;
  PotentialBreakoutProfit?: number;
  CompressionLevel?: string;
}

function processVolatilityData(
  data: RawVolatilityData[]
): VolatilityOpportunity[] {
  // Data is already processed by the database system using VeryGranular methodology
  // Just format it for the API response
  return data.map((item, index) => ({
    id: index + 1,
    name: item.ItemName || "Unknown Item",
    currentPrice: item.CurrentPrice || 0,
    buyLimit: item.BuyLimit || 0,
    dailyRange: item.DailyRange || 0,
    weeklyRange: item.WeeklyRange || 0,
    monthlyRange: item.MonthlyRange || 0,
    compressionRatio: item.CompressionRatio || 0,
    breakoutDirection: item.BreakoutDirection || "NEUTRAL",
    volumeConfirmation: item.VolumeConfirmation || "LOW_VOLUME",
    potentialBreakoutProfit: item.PotentialBreakoutProfit || 0,
    compressionLevel: item.CompressionLevel || "LOW_COMPRESSION",
  }));
}

/** Throws `AppError` (503) if the upstream won't answer — never an empty list. */
export async function buildVolatility(
  requestId: string
): Promise<Payload<VolatilityOpportunity>> {
  const result = await fetchSummary<RawVolatilityData>(
    "volatility-breakout.json",
    "volatility breakout data",
    requestId
  );

  const data = processVolatilityData(result.items);

  return { data, updated: result.updated, count: data.length };
}
