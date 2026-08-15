import { NextResponse } from "next/server";
import { newRequestId, toErrorResponse } from "@/lib/errors";
import { fetchSummary, SUMMARY_CACHE } from "@/lib/upstream";

interface VolumeProfileOpportunity {
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

function processVolumeProfileData(data: RawVolumeData[]): VolumeProfileOpportunity[] {
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

export async function GET() {
  const requestId = newRequestId();

  try {
    const volumeResult = await fetchSummary<RawVolumeData>(
      "volume-profile.json",
      "volume profile data",
      requestId
    );

    // Process volume profile opportunities using database methodology
    const opportunities = processVolumeProfileData(volumeResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = volumeResult.updated
      ? new Date(volumeResult.updated).getTime()
      : Date.now();

    return NextResponse.json(
      {
        success: true,
        data: opportunities,
        timestamp: dataTimestamp,
        dataUpdated: volumeResult.updated,
        count: opportunities.length,
      },
      {
        headers: {
          "Cache-Control": SUMMARY_CACHE,
          "x-request-id": requestId,
        },
      }
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
