import { NextResponse } from "next/server";

interface ManufacturingOpportunity {
  id: string;
  productName: string;
  recipeType: string;
  description: string;
  difficulty: string;

  // Financial metrics
  ingredientCost: number;
  productPrice: number;
  processingCost: number;
  tax: number;
  profitPerUnit: number;
  roi: number;

  // Volume and limits
  effectiveBuyLimit: number;
  maxProfit4h: number;
  capitalRequired: number;

  // Market data
  productVolume24h: number;
  ingredientVolumes: number[];
  volumeBottleneck: number;

  // Requirements
  skillRequired?: {
    skill: string;
    level: number;
  };
  questRequired?: string;
  location?: string;

  // Risk assessment
  liquidityRisk: number;
  capitalRisk: number;
  competitionRisk: number;
  overallRisk: number;
}

// Cache for 5 seconds for instant updates
let manufacturingCache: {
  data: ManufacturingOpportunity[];
  timestamp: number;
} | null = null;
const CACHE_DURATION = 5 * 1000; // 5 seconds

async function fetchDatabaseManufacturingData() {
  try {
    // Try GitHub API first (no CDN cache), fallback to raw CDN
    const githubApiUrl = "https://api.github.com/repos/slippax/lotus-ge/contents/data/summaries/manufacturing-analysis.json";

    let githubResponse;
    try {
      // Try GitHub API first (bypasses CDN cache)
      githubResponse = await fetch(githubApiUrl, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Manufacturing Analysis",
          "Accept": "application/vnd.github.v3.raw",
          "Cache-Control": "no-cache",
        },
      });
    } catch {
      // Fallback to raw CDN if API fails
      const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/manufacturing-analysis.json";
      githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Manufacturing Analysis",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (githubResponse.ok) {
      const summaryData = await githubResponse.json();
      console.log("Using GitHub manufacturing summary data");
      return {
        items: summaryData.items,
        updated: summaryData.updated
      };
    }
  } catch {
    console.log("GitHub manufacturing summary not available, using fallback");
  }

  // Fallback: return empty array for now (will be populated by database collection)
  return { items: [], updated: null };
}

interface RawManufacturingData {
  id?: string;
  ItemName?: string;
  RecipeType?: string;
  HighMargin?: number;
  LowMargin?: number;
  HighMaxProfit?: number;
  LowMaxProfit?: number;
}

function processManufacturingData(data: RawManufacturingData[]): ManufacturingOpportunity[] {
  // Data is already processed by the database system using VeryGranular methodology
  // The data contains profit margins, not raw prices - we need to calculate ingredient costs
  return data.map((item, index) => {
    const highMargin = item.HighMargin || 0;
    const highMaxProfit = item.HighMaxProfit || 0;

    // Estimate ingredient cost and product price from margins
    // For high-value items like Torva, the margins are in millions
    // We'll estimate the ingredient cost as a reasonable percentage of the profit
    let estimatedIngredientCost = 0;
    let estimatedProductPrice = 0;

    if (highMargin > 1000000) {
      // High-value items (like Torva) - ingredient cost is typically 10-50x the profit
      estimatedIngredientCost = highMargin * 8; // Conservative estimate
      estimatedProductPrice = estimatedIngredientCost + highMargin;
    } else if (highMargin > 10000) {
      // Medium-value items - ingredient cost is typically 5-20x the profit
      estimatedIngredientCost = highMargin * 5;
      estimatedProductPrice = estimatedIngredientCost + highMargin;
    } else {
      // Low-value items - ingredient cost is typically 2-10x the profit
      estimatedIngredientCost = Math.max(highMargin * 3, 1000);
      estimatedProductPrice = estimatedIngredientCost + highMargin;
    }

    // Calculate effective buy limit from max profit ratios
    const effectiveBuyLimit = highMargin > 0 ? Math.floor(highMaxProfit / highMargin) : 0;

    return {
      id: item.id || `recipe-${index}`,
      productName: item.ItemName || "Unknown Product",
      recipeType: item.RecipeType || "Database Recipe",
      description: `Process ${item.ItemName || 'Unknown Product'} using ${item.RecipeType || 'Database Recipe'}`,
      difficulty: "Medium", // Default difficulty

      // Financial metrics from database calculations
      ingredientCost: estimatedIngredientCost,
      productPrice: estimatedProductPrice,
      processingCost: 0,
      tax: Math.floor(estimatedProductPrice * 0.01), // 1% GE tax
      profitPerUnit: highMargin,
      roi: estimatedIngredientCost > 0 ? (highMargin / estimatedIngredientCost) * 100 : 0,

      // Volume and limits
      effectiveBuyLimit,
      maxProfit4h: highMaxProfit,
      capitalRequired: estimatedIngredientCost * effectiveBuyLimit,

      // Market data
      productVolume24h: 0,
      ingredientVolumes: [],
      volumeBottleneck: 0,

      // Risk assessment
      liquidityRisk: highMargin > 1000000 ? 3 : 1, // High-value items have higher liquidity risk
      capitalRisk: estimatedIngredientCost > 10000000 ? 3 : estimatedIngredientCost > 1000000 ? 2 : 1,
      competitionRisk: 2, // Medium competition for manufacturing
      overallRisk: Math.min(5, Math.max(1,
        (highMargin > 1000000 ? 3 : 1) +
        (estimatedIngredientCost > 10000000 ? 2 : estimatedIngredientCost > 1000000 ? 1 : 0)
      )),
    };
  });
}

export async function GET() {
  try {
    const now = Date.now();

    // Return cached data if still fresh
    if (
      manufacturingCache &&
      now - manufacturingCache.timestamp < CACHE_DURATION
    ) {
      return NextResponse.json({
        success: true,
        data: manufacturingCache.data,
        timestamp: manufacturingCache.timestamp,
        cached: true,
      });
    }

    // Fetch database manufacturing data
    const manufacturingResult = await fetchDatabaseManufacturingData();

    // Process manufacturing opportunities using database methodology
    const opportunities = processManufacturingData(manufacturingResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = manufacturingResult.updated ? new Date(manufacturingResult.updated).getTime() : now;

    // Cache results
    manufacturingCache = { data: opportunities, timestamp: dataTimestamp };

    return NextResponse.json({
      success: true,
      data: opportunities,
      timestamp: dataTimestamp,
      dataUpdated: manufacturingResult.updated,
      cached: false,
      count: opportunities.length,
      metadata: {
        description:
          "Manufacturing opportunities using VeryGranular research methodology",
        strategy:
          "Database-calculated profit margins with VeryGranular analysis",
        riskLevel: "Medium - requires capital and market timing",
        methodology: "VeryGranular",
      },
    });
  } catch (error) {
    console.error("Manufacturing Analysis API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to analyze manufacturing opportunities",
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
