import { NextResponse } from "next/server";

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

// Cache for 5 seconds for instant updates
const CACHE_DURATION = 5 * 1000;
let alchemyCache: { data: AlchemyOpportunity[]; timestamp: number } | null =
  null;

async function fetchAlchemyData() {
  try {
    // Try GitHub API first (no CDN cache), fallback to raw CDN
    const githubApiUrl = "https://api.github.com/repos/slippax/lotus-ge/contents/data/summaries/alchemy-floors.json";

    let githubResponse;
    try {
      // Try GitHub API first (bypasses CDN cache)
      githubResponse = await fetch(githubApiUrl, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Alchemy Analysis",
          "Accept": "application/vnd.github.v3.raw",
          "Cache-Control": "no-cache",
        },
      });

      // If GitHub API fails (rate limit, etc.), fall back to raw URL
      if (!githubResponse.ok) {
        console.log("GitHub API failed, falling back to raw URL");
        const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/alchemy-floors.json";
        githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
          headers: {
            "User-Agent": "OSRS Data Seeker - Alchemy Analysis",
            "Cache-Control": "no-cache",
          },
        });
      }
    } catch {
      // Fallback to raw CDN if API fails
      console.log("GitHub API exception, falling back to raw URL");
      const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/alchemy-floors.json";
      githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Alchemy Analysis",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (githubResponse.ok) {
      const summaryData = await githubResponse.json();
      console.log("Using GitHub alchemy summary data");
      return {
        items: summaryData.items,
        updated: summaryData.updated
      };
    }
  } catch (error) {
    console.log("GitHub alchemy summary not available:", error);
  }

  // Return empty array if no data available
  return { items: [], updated: null };
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
  try {
    const now = Date.now();

    // Return cached data if still fresh
    if (alchemyCache && now - alchemyCache.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        data: alchemyCache.data,
        timestamp: alchemyCache.timestamp,
        cached: true,
      });
    }

    // Fetch alchemy data from database
    const alchemyResult = await fetchAlchemyData();

    // Process alchemy opportunities using database methodology
    const opportunities = processAlchemyData(alchemyResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = alchemyResult.updated ? new Date(alchemyResult.updated).getTime() : now;

    // Cache results
    alchemyCache = { data: opportunities, timestamp: dataTimestamp };

    return NextResponse.json({
      success: true,
      data: opportunities,
      timestamp: dataTimestamp,
      dataUpdated: alchemyResult.updated,
      cached: false,
      count: opportunities.length,
      metadata: {
        description:
          "High alchemy opportunities using VeryGranular research methodology",
        strategy: "Buy items below alch value, high alch for guaranteed profit",
        riskLevel: "Low - guaranteed profit from NPCs",
        methodology: "VeryGranular",
      },
    });
  } catch (error) {
    console.error("Alchemy Floors API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to analyze alchemy opportunities",
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
