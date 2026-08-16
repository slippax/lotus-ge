/**
 * Recipe arbitrage: crafted products worth more than their ingredients.
 *
 * HTTP-free, version-blind. See `src/lib/summaries/dips.ts` for why.
 */

import { fetchSummary } from "@/lib/upstream";
import type { Payload } from "@/lib/render";

export interface RecipeArbitrageOpportunity {
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

function processRecipeArbitrageData(
  data: RawRecipeData[]
): RecipeArbitrageOpportunity[] {
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

/** Throws `AppError` (503) if the upstream won't answer — never an empty list. */
export async function buildRecipes(
  requestId: string
): Promise<Payload<RecipeArbitrageOpportunity>> {
  const result = await fetchSummary<RawRecipeData>(
    "recipe-arbitrage.json",
    "recipe arbitrage data",
    requestId
  );

  const data = processRecipeArbitrageData(result.items);

  return { data, updated: result.updated, count: data.length };
}
