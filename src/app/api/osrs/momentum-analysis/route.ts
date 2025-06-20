import { NextResponse } from "next/server";

interface MomentumOpportunity {
  id: number;
  name: string;
  members: boolean;
  icon: string;

  // Current state
  currentPrice: number;
  dailyAverage: number;

  // Momentum metrics
  momentumROC: number; // Rate of Change percentage
  momentumSignal: string; // STRONG_UPWARD_MOMENTUM, etc.
  volumeConfirmation: string; // HIGH_VOLUME_SURGE, etc.
  trendDirection: string; // UPWARD, SIDEWAYS, DOWNWARD

  // Trading metrics
  buyLimit: number;
  strategyType: string; // TREND_FOLLOWING
  recommendedAction: string; // BUY_AND_RIDE_MOMENTUM

  // Risk assessment
  momentumStrength: number; // 0-100 scale
  riskScore: number; // Overall risk (lower = better)
}

// Cache for 5 seconds for instant updates
let momentumCache: { data: MomentumOpportunity[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 1000; // 5 seconds

async function fetchMomentumData() {
  try {
    // Try GitHub API first (no CDN cache), fallback to raw CDN
    const githubApiUrl = "https://api.github.com/repos/slippax/lotus-ge/contents/data/summaries/momentum-items.json";

    let githubResponse;
    try {
      // Try GitHub API first (bypasses CDN cache)
      githubResponse = await fetch(githubApiUrl, {
        headers: {
          "User-Agent": "OSRS Data Seeker - ROC Momentum Analysis",
          "Accept": "application/vnd.github.v3.raw",
          "Cache-Control": "no-cache",
        },
      });
      
      // If GitHub API fails (rate limit, etc.), fall back to raw URL
      if (!githubResponse.ok) {
        console.log("GitHub API failed, falling back to raw URL");
        const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/momentum-items.json";
        githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
          headers: {
            "User-Agent": "OSRS Data Seeker - ROC Momentum Analysis",
            "Cache-Control": "no-cache",
          },
        });
      }
    } catch {
      // Fallback to raw CDN if API fails
      console.log("GitHub API exception, falling back to raw URL");
      const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/momentum-items.json";
      githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
        headers: {
          "User-Agent": "OSRS Data Seeker - ROC Momentum Analysis",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (githubResponse.ok) {
      const summaryData = await githubResponse.json();
      console.log("Using ROC-based GitHub momentum analysis data");
      return {
        items: summaryData.items,
        updated: summaryData.updated
      };
    }
  } catch {
    console.log("GitHub momentum summary not available, using fallback");
  }

  // Fallback: return empty array (will be populated by database collection)
  return { items: [], updated: null };
}

interface RawMomentumData {
  ItemName?: string;
  CurrentPrice?: number;
  DailyAverage?: number;
  BuyLimit?: number;
  momentum_roc_pct?: number;
  momentum_signal?: string;
  volume_confirmation?: string;
  strategy_type?: string;
  recommended_action?: string;
}

function processMomentumData(data: RawMomentumData[]): MomentumOpportunity[] {
  // Data is already processed by the database system using ROC methodology
  // Just format it for the API response
  return data.map((item, index) => ({
    id: index + 1,
    name: item.ItemName || "Unknown Item",
    members: true, // Most momentum items are members items
    icon: "",

    // Current state (from database analysis)
    currentPrice: item.CurrentPrice || 0,
    dailyAverage: item.DailyAverage || 0,

    // Momentum metrics (from ROC analysis)
    momentumROC: item.momentum_roc_pct || 0,
    momentumSignal: item.momentum_signal || "NO_MOMENTUM",
    volumeConfirmation: item.volume_confirmation || "NORMAL_VOLUME",
    trendDirection: item.momentum_roc_pct && item.momentum_roc_pct > 0 ? "UPWARD" : "SIDEWAYS",

    // Trading metrics (from database)
    buyLimit: item.BuyLimit || 0,
    strategyType: item.strategy_type || "TREND_FOLLOWING",
    recommendedAction: item.recommended_action || "BUY_AND_RIDE_MOMENTUM",

    // Risk assessment (calculated)
    momentumStrength: Math.min(100, Math.max(0, (item.momentum_roc_pct || 0) * 2)), // Scale ROC to 0-100
    riskScore: item.momentum_roc_pct && item.momentum_roc_pct > 10 ? 3 : 2, // Higher momentum = higher risk
  }));
}

export async function GET() {
  try {
    const now = Date.now();

    // Return cached data if still fresh
    if (momentumCache && now - momentumCache.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        data: momentumCache.data,
        timestamp: momentumCache.timestamp,
        cached: true,
      });
    }

    // Fetch momentum data from database
    const momentumResult = await fetchMomentumData();

    // Process momentum using ROC methodology
    const momentum = processMomentumData(momentumResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = momentumResult.updated ? new Date(momentumResult.updated).getTime() : now;

    // Cache results
    momentumCache = { data: momentum, timestamp: dataTimestamp };

    return NextResponse.json({
      success: true,
      data: momentum,
      timestamp: dataTimestamp,
      dataUpdated: momentumResult.updated,
      cached: false,
      count: momentum.length,
    });
  } catch (error) {
    console.error("Momentum Analysis API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to analyze momentum opportunities",
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
