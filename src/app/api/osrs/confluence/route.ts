import { newRequestId, toErrorResponse } from "@/lib/errors";
import { legacy } from "@/lib/render";
import { buildConfluence } from "@/lib/summaries/confluence";

/**
 * GET /api/osrs/confluence - pre-v1 shape, frozen contract.
 * see /api/osrs/dip-detection for why. new work goes to /api/v1/confluence.
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    return legacy(await buildConfluence(requestId), requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
