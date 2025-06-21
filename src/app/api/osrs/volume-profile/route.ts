import { NextResponse } from "next/server";

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

// Cache for 5 seconds for instant updates
let volumeCache: { data: VolumeProfileOpportunity[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 1000; // 5 seconds

async function fetchVolumeProfileData() {
  try {
    // Try GitHub API first (no CDN cache), fallback to raw CDN
    const githubApiUrl = "https://api.github.com/repos/slippax/lotus-ge/contents/data/summaries/volume-profile.json";

    let githubResponse;
    try {
      // Try GitHub API first (bypasses CDN cache)
      githubResponse = await fetch(githubApiUrl, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Volume Profile Analysis",
          "Accept": "application/vnd.github.v3.raw",
          "Cache-Control": "no-cache",
        },
      });

      // If GitHub API fails (rate limit, etc.), fall back to raw URL
      if (!githubResponse.ok) {
        console.log("GitHub API failed, falling back to raw URL");
        const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/volume-profile.json";
        githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
          headers: {
            "User-Agent": "OSRS Data Seeker - Volume Profile Analysis",
            "Cache-Control": "no-cache",
          },
        });
      }
    } catch {
      // Fallback to raw CDN if API fails
      console.log("GitHub API exception, falling back to raw URL");
      const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/volume-profile.json";
      githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Volume Profile Analysis",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (githubResponse.ok) {
      const summaryData = await githubResponse.json();
      console.log("Using GitHub volume profile summary data");
      return {
        items: summaryData.items,
        updated: summaryData.updated
      };
    }
  } catch (error) {
    console.log("GitHub volume profile summary not available:", error);
  }

  // Return empty array if no data available
  return { items: [], updated: null };
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
  try {
    const now = Date.now();

    // Return cached data if still fresh
    if (volumeCache && now - volumeCache.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        data: volumeCache.data,
        timestamp: volumeCache.timestamp,
        cached: true,
        count: volumeCache.data.length,
      });
    }

    // Fetch volume profile data from database
    const volumeResult = await fetchVolumeProfileData();

    // Process volume profile opportunities using database methodology
    const opportunities = processVolumeProfileData(volumeResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = volumeResult.updated ? new Date(volumeResult.updated).getTime() : now;

    // Cache results
    volumeCache = { data: opportunities, timestamp: dataTimestamp };

    return NextResponse.json({
      success: true,
      data: opportunities,
      timestamp: dataTimestamp,
      dataUpdated: volumeResult.updated,
      cached: false,
      count: opportunities.length,
    });
  } catch (error) {
    console.error("Volume Profile API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch volume profile data",
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
