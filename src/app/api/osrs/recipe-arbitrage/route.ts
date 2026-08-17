import { newRequestId, toErrorResponse } from "@/lib/errors";
import { legacy } from "@/lib/render";
import { buildRecipes } from "@/lib/summaries/recipes";

/**
 * GET /api/osrs/recipe-arbitrage - pre-v1 shape, frozen contract.
 * see /api/osrs/dip-detection for why. new work goes to /api/v1/...
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    return legacy(await buildRecipes(requestId), requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
