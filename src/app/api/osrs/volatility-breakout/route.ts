import { NextResponse } from "next/server";
import { newRequestId, toErrorResponse } from "@/lib/errors";
import { fetchSummary, SUMMARY_CACHE } from "@/lib/upstream";

interface VolatilityOpportunity {
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

function processVolatilityData(data: RawVolatilityData[]): VolatilityOpportunity[] {
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

export async function GET() {
  const requestId = newRequestId();

  try {
    const volatilityResult = await fetchSummary<RawVolatilityData>(
      "volatility-breakout.json",
      "volatility breakout data",
      requestId
    );

    // Process volatility opportunities using database methodology
    const opportunities = processVolatilityData(volatilityResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = volatilityResult.updated
      ? new Date(volatilityResult.updated).getTime()
      : Date.now();

    return NextResponse.json(
      {
        success: true,
        data: opportunities,
        timestamp: dataTimestamp,
        dataUpdated: volatilityResult.updated,
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
