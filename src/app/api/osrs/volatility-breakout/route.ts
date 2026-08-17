import { newRequestId, toErrorResponse } from "@/lib/errors";
import { legacy } from "@/lib/render";
import { buildVolatility } from "@/lib/summaries/volatility";

/**
 * GET /api/osrs/volatility-breakout - pre-v1 shape, frozen contract.
 * see /api/osrs/dip-detection for why. new work goes to /api/v1/...
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    return legacy(await buildVolatility(requestId), requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
