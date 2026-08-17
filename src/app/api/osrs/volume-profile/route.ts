import { newRequestId, toErrorResponse } from "@/lib/errors";
import { legacy } from "@/lib/render";
import { buildVolume } from "@/lib/summaries/volume";

/**
 * GET /api/osrs/volume-profile - pre-v1 shape, frozen contract.
 * see /api/osrs/dip-detection for why. new work goes to /api/v1/...
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    return legacy(await buildVolume(requestId), requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
