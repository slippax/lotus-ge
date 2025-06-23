import { NextResponse } from "next/server";

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

// Cache for 5 seconds for instant updates
let volatilityCache: { data: VolatilityOpportunity[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 1000; // 5 seconds

async function fetchVolatilityData() {
  try {
    // Try GitHub API first (no CDN cache), fallback to raw CDN
    const githubApiUrl = "https://api.github.com/repos/slippax/lotus-ge/contents/data/summaries/volatility-breakout.json";

    let githubResponse;
    try {
      // Try GitHub API first (bypasses CDN cache)
      githubResponse = await fetch(githubApiUrl, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Volatility Breakout Analysis",
          "Accept": "application/vnd.github.v3.raw",
          "Cache-Control": "no-cache",
        },
      });

      // If GitHub API fails (rate limit, etc.), fall back to raw URL
      if (!githubResponse.ok) {
        console.log("GitHub API failed, falling back to raw URL");
        const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/volatility-breakout.json";
        githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
          headers: {
            "User-Agent": "OSRS Data Seeker - Volatility Breakout Analysis",
            "Cache-Control": "no-cache",
          },
        });
      }
    } catch {
      // Fallback to raw CDN if API fails
      console.log("GitHub API exception, falling back to raw URL");
      const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/volatility-breakout.json";
      githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Volatility Breakout Analysis",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (githubResponse.ok) {
      const summaryData = await githubResponse.json();
      console.log("Using GitHub volatility breakout summary data");
      return {
        items: summaryData.items,
        updated: summaryData.updated
      };
    }
  } catch (error) {
    console.log("GitHub volatility breakout summary not available:", error);
  }

  // Return empty array if no data available
  return { items: [], updated: null };
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
  try {
    const now = Date.now();

    // Return cached data if still fresh
    if (volatilityCache && now - volatilityCache.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        data: volatilityCache.data,
        timestamp: volatilityCache.timestamp,
        cached: true,
        count: volatilityCache.data.length,
      });
    }

    // Fetch volatility data from database
    const volatilityResult = await fetchVolatilityData();

    // Process volatility opportunities using database methodology
    const opportunities = processVolatilityData(volatilityResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = volatilityResult.updated ? new Date(volatilityResult.updated).getTime() : now;

    // Cache results
    volatilityCache = { data: opportunities, timestamp: dataTimestamp };

    return NextResponse.json({
      success: true,
      data: opportunities,
      timestamp: dataTimestamp,
      dataUpdated: volatilityResult.updated,
      cached: false,
      count: opportunities.length,
    });
  } catch (error) {
    console.error("Volatility Breakout API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch volatility breakout data",
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
