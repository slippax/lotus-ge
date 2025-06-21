import { NextResponse } from "next/server";

interface RecipeArbitrageOpportunity {
  id: number;
  productName: string;
  productPrice: number;
  productBuyLimit: number;
  ingredient1Name: string;
  ingredient1Price: number;
  ingredient1Qty: string;
  ingredient2Name: string;
  ingredient2Price: number;
  ingredient2Qty: string;
  ingredient3Name: string;
  ingredient3Price: number;
  ingredient3Qty: string;
  totalIngredientCost: number;
  profitPerCraft: number;
  roi: number;
  recipeType: string;
  qtyProduced: number;
  liquidityLevel: string;
}

interface RawRecipeData {
  ProductName?: string;
  ProductPrice?: number;
  ProductBuyLimit?: number;
  Ingredient1Name?: string;
  Ingredient1Price?: number;
  Ingredient1Qty?: string;
  Ingredient2Name?: string;
  Ingredient2Price?: number;
  Ingredient2Qty?: string;
  Ingredient3Name?: string;
  Ingredient3Price?: number;
  Ingredient3Qty?: string;
  TotalIngredientCost?: number;
  ProfitPerCraft?: number;
  ROI?: number;
  RecipeType?: string;
  QtyProduced?: number;
  LiquidityLevel?: string;
}

// Cache for 5 seconds for instant updates
let recipeCache: { data: RecipeArbitrageOpportunity[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 1000; // 5 seconds

async function fetchRecipeArbitrageData() {
  try {
    // Try GitHub API first (no CDN cache), fallback to raw CDN
    const githubApiUrl = "https://api.github.com/repos/slippax/lotus-ge/contents/data/summaries/recipe-arbitrage.json";

    let githubResponse;
    try {
      // Try GitHub API first (bypasses CDN cache)
      githubResponse = await fetch(githubApiUrl, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Recipe Arbitrage Analysis",
          "Accept": "application/vnd.github.v3.raw",
          "Cache-Control": "no-cache",
        },
      });

      // If GitHub API fails (rate limit, etc.), fall back to raw URL
      if (!githubResponse.ok) {
        console.log("GitHub API failed, falling back to raw URL");
        const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/recipe-arbitrage.json";
        githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
          headers: {
            "User-Agent": "OSRS Data Seeker - Recipe Arbitrage Analysis",
            "Cache-Control": "no-cache",
          },
        });
      }
    } catch {
      // Fallback to raw CDN if API fails
      console.log("GitHub API exception, falling back to raw URL");
      const githubUrl = "https://raw.githubusercontent.com/slippax/lotus-ge/main/data/summaries/recipe-arbitrage.json";
      githubResponse = await fetch(`${githubUrl}?t=${Date.now()}`, {
        headers: {
          "User-Agent": "OSRS Data Seeker - Recipe Arbitrage Analysis",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (githubResponse.ok) {
      const summaryData = await githubResponse.json();
      console.log("Using GitHub recipe arbitrage summary data");
      return {
        items: summaryData.items,
        updated: summaryData.updated
      };
    }
  } catch (error) {
    console.log("GitHub recipe arbitrage summary not available:", error);
  }

  // Return empty array if no data available
  return { items: [], updated: null };
}

function processRecipeArbitrageData(data: RawRecipeData[]): RecipeArbitrageOpportunity[] {
  // Data is already processed by the database system using VeryGranular methodology
  // Just format it for the API response
  return data.map((item, index) => ({
    id: index + 1,
    productName: item.ProductName || "Unknown Product",
    productPrice: item.ProductPrice || 0,
    productBuyLimit: item.ProductBuyLimit || 0,
    ingredient1Name: item.Ingredient1Name || "",
    ingredient1Price: item.Ingredient1Price || 0,
    ingredient1Qty: item.Ingredient1Qty || "",
    ingredient2Name: item.Ingredient2Name || "",
    ingredient2Price: item.Ingredient2Price || 0,
    ingredient2Qty: item.Ingredient2Qty || "",
    ingredient3Name: item.Ingredient3Name || "",
    ingredient3Price: item.Ingredient3Price || 0,
    ingredient3Qty: item.Ingredient3Qty || "",
    totalIngredientCost: item.TotalIngredientCost || 0,
    profitPerCraft: item.ProfitPerCraft || 0,
    roi: item.ROI || 0,
    recipeType: item.RecipeType || "",
    qtyProduced: item.QtyProduced || 0,
    liquidityLevel: item.LiquidityLevel || "LOW_LIQUIDITY",
  }));
}

export async function GET() {
  try {
    const now = Date.now();

    // Return cached data if still fresh
    if (recipeCache && now - recipeCache.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        data: recipeCache.data,
        timestamp: recipeCache.timestamp,
        cached: true,
        count: recipeCache.data.length,
      });
    }

    // Fetch recipe arbitrage data from database
    const recipeResult = await fetchRecipeArbitrageData();

    // Process recipe arbitrage opportunities using database methodology
    const opportunities = processRecipeArbitrageData(recipeResult.items);

    // Use the actual timestamp from GitHub data, or current time as fallback
    const dataTimestamp = recipeResult.updated ? new Date(recipeResult.updated).getTime() : now;

    // Cache results
    recipeCache = { data: opportunities, timestamp: dataTimestamp };

    return NextResponse.json({
      success: true,
      data: opportunities,
      timestamp: dataTimestamp,
      dataUpdated: recipeResult.updated,
      cached: false,
      count: opportunities.length,
    });
  } catch (error) {
    console.error("Recipe Arbitrage API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch recipe arbitrage data",
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
