import { NextResponse } from "next/server";
import { newRequestId, toErrorResponse } from "@/lib/errors";
import { fetchSummary, SUMMARY_CACHE } from "@/lib/upstream";

interface ConfluenceOpportunity {
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

function processConfluenceData(data: RawConfluenceData[]): ConfluenceOpportunity[] {
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

export async function GET() {
  const requestId = newRequestId();

  try {
    const confluenceResult = await fetchSummary<RawConfluenceData>(
      "confluence-analysis.json",
      "confluence analysis",
      requestId
    );

    // Process confluence opportunities using database methodology
    const opportunities = processConfluenceData(confluenceResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = confluenceResult.updated
      ? new Date(confluenceResult.updated).getTime()
      : Date.now();

    return NextResponse.json(
      {
        success: true,
        data: opportunities,
        timestamp: dataTimestamp,
        dataUpdated: confluenceResult.updated,
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
