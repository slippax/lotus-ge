import { newRequestId, toErrorResponse } from "@/lib/errors";
import { v1 } from "@/lib/render";
import { buildRecipes } from "@/lib/summaries/recipes";

/** GET /api/v1/recipe-arbitrage — clean envelope over the same data. */
export async function GET() {
  const requestId = newRequestId();

  try {
    return v1(await buildRecipes(requestId), requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
