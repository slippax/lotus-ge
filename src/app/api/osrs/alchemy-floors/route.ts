import { NextResponse } from "next/server";
import { newRequestId, toErrorResponse } from "@/lib/errors";
import { fetchSummary, SUMMARY_CACHE } from "@/lib/upstream";

interface AlchemyOpportunity {
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

export async function GET() {
  const requestId = newRequestId();

  try {
    const alchemyResult = await fetchSummary<RawAlchemyData>(
      "alchemy-floors.json",
      "alchemy floors",
      requestId
    );

    // Process alchemy opportunities using database methodology
    const opportunities = processAlchemyData(alchemyResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = alchemyResult.updated
      ? new Date(alchemyResult.updated).getTime()
      : Date.now();

    return NextResponse.json(
      {
        success: true,
        data: opportunities,
        timestamp: dataTimestamp,
        dataUpdated: alchemyResult.updated,
        count: opportunities.length,
        metadata: {
          description:
            "High alchemy opportunities using VeryGranular research methodology",
          strategy: "Buy items below alch value, high alch for guaranteed profit",
          riskLevel: "Low - guaranteed profit from NPCs",
          methodology: "VeryGranular",
        },
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
