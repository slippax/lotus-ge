/**
 * buy/sell volume imbalance, as an accumulation signal.
 *
 * http-free and version-blind, see dips.ts for why.
 */

import { fetchSummary } from "@/lib/upstream";
import type { Payload } from "@/lib/render";

export interface VolumeProfileOpportunity {
  id: number;
  name: string;
  currentPrice: number;
  currentHigh: number;
  buyLimit: number;
  lowPriceVolume: number;
  highPriceVolume: number;
  weeklyLowVolume: number;
  weeklyHighVolume: number;
  volumeImbalanceRatio: number;
  volumePattern: string;
  volumeSurge: string;
  smartMoneySignal: string;
  accumulationProfit: number;
}

interface RawVolumeData {
  ItemName?: string;
  CurrentPrice?: number;
  CurrentHigh?: number;
  BuyLimit?: number;
  LowPriceVolume?: number;
  HighPriceVolume?: number;
  WeeklyLowVolume?: number;
  WeeklyHighVolume?: number;
  VolumeImbalanceRatio?: number;
  VolumePattern?: string;
  VolumeSurge?: string;
  SmartMoneySignal?: string;
  AccumulationProfit?: number;
}

function processVolumeProfileData(
  data: RawVolumeData[]
): VolumeProfileOpportunity[] {
  // Data is already processed by the database system using VeryGranular methodology
  // Just format it for the API response
  return data.map((item, index) => ({
    id: index + 1,
    name: item.ItemName || "Unknown Item",
    currentPrice: item.CurrentPrice || 0,
    currentHigh: item.CurrentHigh || 0,
    buyLimit: item.BuyLimit || 0,
    lowPriceVolume: item.LowPriceVolume || 0,
    highPriceVolume: item.HighPriceVolume || 0,
    weeklyLowVolume: item.WeeklyLowVolume || 0,
    weeklyHighVolume: item.WeeklyHighVolume || 0,
    volumeImbalanceRatio: item.VolumeImbalanceRatio || 0,
    volumePattern: item.VolumePattern || "BALANCED",
    volumeSurge: item.VolumeSurge || "NORMAL_VOLUME",
    smartMoneySignal: item.SmartMoneySignal || "NO_SMART_MONEY_SIGNAL",
    accumulationProfit: item.AccumulationProfit || 0,
  }));
}

/** throws a 503 if the upstream won't answer. never an empty list. */
export async function buildVolume(
  requestId: string
): Promise<Payload<VolumeProfileOpportunity>> {
  const result = await fetchSummary<RawVolumeData>(
    "volume-profile.json",
    "volume profile data",
    requestId
  );

  const data = processVolumeProfileData(result.items);

  return { data, updated: result.updated, count: data.length };
}
