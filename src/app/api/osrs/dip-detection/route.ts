import { NextResponse } from "next/server";
import { errors, newRequestId, toErrorResponse } from "@/lib/errors";

// Local-only failure switch. UPSTREAM_FAIL=ratelimit makes every call to GitHub
// respond the way GitHub does when you exceed 60 requests/hour unauthenticated,
// without actually going over the wire. Nothing sets this in production.
async function upstreamFetch(url: string, init?: RequestInit): Promise<Response> {
  if (process.env.UPSTREAM_FAIL === "ratelimit") {
    console.log(`UPSTREAM_FAIL=ratelimit -> 403 for ${url}`);
    return new Response(
      JSON.stringify({
        message: "API rate limit exceeded for 10.0.0.152.",
        documentation_url: "https://docs.github.com/rest/overview/rate-limits",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return fetch(url, init);
}

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

// Cache for 5 seconds for instant updates
let dipCache: { data: DipOpportunity[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 1000; // 5 seconds

async function fetchDipDetectionData(requestId: string) {
  // Try GitHub API first (no CDN cache), fallback to raw CDN
  const githubApiUrl = "https://api.github.com/repos/slippax/lotus-ge/contents/data/summaries/dipped-items.json";
  const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/dipped-items.json";

  let githubResponse: Response;
  try {
    // Try GitHub API first (bypasses CDN cache)
    githubResponse = await upstreamFetch(githubApiUrl, {
      headers: {
        "User-Agent": "OSRS Data Seeker - VeryGranular Dip Detection",
        "Accept": "application/vnd.github.v3.raw",
        "Cache-Control": "no-cache",
      },
    });

    // If GitHub API fails (rate limit, etc.), fall back to raw URL
    if (!githubResponse.ok) {
      console.log(`[${requestId}] GitHub API ${githubResponse.status}, falling back to raw URL`);
      githubResponse = await upstreamFetch(`${githubUrl}?t=${Date.now()}`, {
        headers: {
          "User-Agent": "OSRS Data Seeker - VeryGranular Dip Detection",
          "Cache-Control": "no-cache",
        },
      });
    }
  } catch {
    // Both paths failed at the network level — DNS, refused, timeout.
    console.log(`[${requestId}] GitHub unreachable`);
    throw errors.upstreamUnavailable(
      "github_unreachable",
      "Could not reach GitHub to load dip data."
    );
  }

  // A 403/404/500 from GitHub does NOT throw — fetch only rejects on network
  // failure. This explicit check is what used to be missing: execution fell
  // through to `return { items: [] }` and the caller reported success.
  if (!githubResponse.ok) {
    throw errors.upstreamUnavailable(
      "github_unavailable",
      `GitHub returned ${githubResponse.status} when loading dip data.`
    );
  }

  const summaryData = await githubResponse.json();
  console.log(`[${requestId}] Using VeryGranular GitHub dip detection data`);
  return {
    items: summaryData.items,
    updated: summaryData.updated,
  };
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
    const now = Date.now();

    // Return cached data if still fresh
    if (dipCache && now - dipCache.timestamp < CACHE_DURATION) {
      return NextResponse.json(
        {
          success: true,
          data: dipCache.data,
          timestamp: dipCache.timestamp,
          cached: true,
        },
        { headers: { "x-request-id": requestId } }
      );
    }

    // Fetch dip detection data from database
    const dipResult = await fetchDipDetectionData(requestId);

    // Process dips using VeryGranular methodology
    const dips = processDipData(dipResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = dipResult.updated ? new Date(dipResult.updated).getTime() : now;

    // Cache results
    dipCache = { data: dips, timestamp: dataTimestamp };

    return NextResponse.json(
      {
        success: true,
        data: dips,
        timestamp: dataTimestamp,
        dataUpdated: dipResult.updated,
        cached: false,
        count: dips.length,
      },
      { headers: { "x-request-id": requestId } }
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
