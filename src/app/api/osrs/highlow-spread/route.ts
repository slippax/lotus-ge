import { NextResponse } from "next/server";

interface HighLowOpportunity {
  id: string;
  name: string;
  members: boolean;
  icon: string;

  lowPrice: number;
  highPrice: number;
  spread: number;
  spreadPercent: number;

  lowVolume24h: number;
  highVolume24h: number;
  volumeRatio: number;

  buyLimit: number;
  dailyProfit: number;
  roi: number;

  capitalRequired: number;
  liquidityRisk: number;
  volatilityRisk: number;
  overallRisk: number;
}

// Cache for 5 seconds for instant updates
const CACHE_DURATION = 5 * 1000;
let highlowCache: { data: HighLowOpportunity[]; timestamp: number } | null =
  null;

async function fetchHighLowData() {
  try {
    // Try GitHub API first (no CDN cache), fallback to raw CDN
    const githubApiUrl = "https://api.github.com/repos/slippax/lotus-ge/contents/data/summaries/highlow-spread.json";

    let githubResponse;
    try {
      // Try GitHub API first (bypasses CDN cache)
      githubResponse = await fetch(githubApiUrl, {
        headers: {
          "User-Agent": "OSRS Data Seeker - High-Low Spread Analysis",
          "Accept": "application/vnd.github.v3.raw",
          "Cache-Control": "no-cache",
        },
      });

      // If GitHub API fails (rate limit, etc.), fall back to raw URL
      if (!githubResponse.ok) {
        console.log("GitHub API failed, falling back to raw URL");
        const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/highlow-spread.json";
        githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
          headers: {
            "User-Agent": "OSRS Data Seeker - High-Low Spread Analysis",
            "Cache-Control": "no-cache",
          },
        });
      }
    } catch {
      // Fallback to raw CDN if API fails
      console.log("GitHub API exception, falling back to raw URL");
      const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/highlow-spread.json";
      githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
        headers: {
          "User-Agent": "OSRS Data Seeker - High-Low Spread Analysis",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (githubResponse.ok) {
      const summaryData = await githubResponse.json();
      console.log("Using GitHub high-low spread summary data");
      return {
        items: summaryData.items,
        updated: summaryData.updated
      };
    }
  } catch (error) {
    console.log("GitHub high-low spread summary not available:", error);
  }

  // Return empty array if no data available
  return { items: [], updated: null };
}

interface RawHighLowData {
  id?: number;
  ItemName?: string;
  LowPrice?: number;
  HighPrice?: number;
  LowVol?: number;
  HighVol?: number;
  DailyProfit?: number;
  BuyLimit?: number;
  pctROI?: number;
  members?: boolean;
}

function processHighLowData(data: RawHighLowData[]): HighLowOpportunity[] {
  // Data is already processed by the database system using VeryGranular methodology
  // Just format it for the API response with OSRS number formatting
  return data.map((item, index) => {
    const lowPrice = item.LowPrice || 0;
    const highPrice = item.HighPrice || 0;
    const spread = highPrice - lowPrice;
    const spreadPercent = lowPrice > 0 ? (spread / lowPrice) * 100 : 0;
    const lowVol = item.LowVol || 0;
    const highVol = item.HighVol || 0;
    const volumeRatio = highVol > 0 ? lowVol / highVol : 0;

    return {
      id: `highlow-${index}`,
      name: item.ItemName || "Unknown Item",
      members: true, // Default to members
      icon: "",

      // Price data (from VeryGranular analysis)
      lowPrice,
      highPrice,
      spread,
      spreadPercent,

      // Volume data (from database)
      lowVolume24h: lowVol,
      highVolume24h: highVol,
      volumeRatio,

      // Trading metrics (from database)
      buyLimit: item.BuyLimit || 0,
      dailyProfit: item.DailyProfit || 0,
      roi: item.pctROI || 0,

      // Risk assessment
      capitalRequired: lowPrice * (item.BuyLimit || 0),
      liquidityRisk: volumeRatio < 0.5 ? 2 : 1,
      volatilityRisk: spreadPercent > 20 ? 2 : 1,
      overallRisk: Math.min(
        5,
        Math.max(
          1,
          (volumeRatio < 0.5 ? 2 : 1) +
            (spreadPercent > 20 ? 2 : 1) +
            (lowPrice > 10000000 ? 1 : 0)
        )
      ),
    };
  });
}

export async function GET() {
  try {
    const now = Date.now();

    // Return cached data if still fresh
    if (highlowCache && now - highlowCache.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        data: highlowCache.data,
        timestamp: highlowCache.timestamp,
        cached: true,
      });
    }

    // Fetch high-low data from database
    const highlowResult = await fetchHighLowData();

    // Process high-low opportunities using database methodology
    const opportunities = processHighLowData(highlowResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = highlowResult.updated ? new Date(highlowResult.updated).getTime() : now;

    // Cache results
    highlowCache = { data: opportunities, timestamp: dataTimestamp };

    return NextResponse.json({
      success: true,
      data: opportunities,
      timestamp: dataTimestamp,
      dataUpdated: highlowResult.updated,
      cached: false,
      count: opportunities.length,
      metadata: {
        description:
          "High-low spread opportunities using VeryGranular research methodology",
        strategy:
          "Buy at low price, sell at high price using VeryGranular analysis",
        riskLevel: "Medium - requires timing and market knowledge",
        methodology: "VeryGranular",
      },
    });
  } catch (error) {
    console.error("High-Low Spread API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to analyze high-low spread opportunities",
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
