import { NextResponse } from "next/server";

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

// Cache for 5 seconds for instant updates
let confluenceCache: { data: ConfluenceOpportunity[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 1000; // 5 seconds

async function fetchConfluenceData() {
  try {
    // Try GitHub API first (no CDN cache), fallback to raw CDN
    const githubApiUrl = "https://api.github.com/repos/slippax/lotus-ge/contents/data/summaries/confluence-analysis.json";

    let githubResponse;
    try {
      // Try GitHub API first (bypasses CDN cache)
      githubResponse = await fetch(githubApiUrl, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Confluence Analysis",
          "Accept": "application/vnd.github.v3.raw",
          "Cache-Control": "no-cache",
        },
      });

      // If GitHub API fails (rate limit, etc.), fall back to raw URL
      if (!githubResponse.ok) {
        console.log("GitHub API failed, falling back to raw URL");
        const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/confluence-analysis.json";
        githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
          headers: {
            "User-Agent": "OSRS Data Seeker - Confluence Analysis",
            "Cache-Control": "no-cache",
          },
        });
      }
    } catch {
      // Fallback to raw CDN if API fails
      console.log("GitHub API exception, falling back to raw URL");
      const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/confluence-analysis.json";
      githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Confluence Analysis",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (githubResponse.ok) {
      const summaryData = await githubResponse.json();
      console.log("Using GitHub confluence analysis summary data");
      return {
        items: summaryData.items,
        updated: summaryData.updated
      };
    }
  } catch (error) {
    console.log("GitHub confluence analysis summary not available:", error);
  }

  // Return empty array if no data available
  return { items: [], updated: null };
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
  try {
    const now = Date.now();

    // Return cached data if still fresh
    if (confluenceCache && now - confluenceCache.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        data: confluenceCache.data,
        timestamp: confluenceCache.timestamp,
        cached: true,
        count: confluenceCache.data.length,
      });
    }

    // Fetch confluence data from database
    const confluenceResult = await fetchConfluenceData();

    // Process confluence opportunities using database methodology
    const opportunities = processConfluenceData(confluenceResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = confluenceResult.updated ? new Date(confluenceResult.updated).getTime() : now;

    // Cache results
    confluenceCache = { data: opportunities, timestamp: dataTimestamp };

    return NextResponse.json({
      success: true,
      data: opportunities,
      timestamp: dataTimestamp,
      dataUpdated: confluenceResult.updated,
      cached: false,
      count: opportunities.length,
    });
  } catch (error) {
    console.error("Confluence Analysis API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch confluence analysis data",
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
