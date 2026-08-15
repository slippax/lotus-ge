import { NextResponse } from "next/server";
import { newRequestId, toErrorResponse } from "@/lib/errors";
import { fetchSummary, SUMMARY_CACHE } from "@/lib/upstream";

interface DipOpportunity {
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

export async function GET() {
  const requestId = newRequestId();

  try {
    const dipResult = await fetchSummary<RawDipData>(
      "dipped-items.json",
      "dip data",
      requestId
    );

    // Process dips using VeryGranular methodology
    const dips = processDipData(dipResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = dipResult.updated
      ? new Date(dipResult.updated).getTime()
      : Date.now();

    return NextResponse.json(
      {
        success: true,
        data: dips,
        timestamp: dataTimestamp,
        dataUpdated: dipResult.updated,
        count: dips.length,
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
