import { newRequestId, toErrorResponse } from "@/lib/errors";
import { legacy } from "@/lib/render";
import { buildDips, toLegacyDip } from "@/lib/summaries/dips";

/**
 * GET /api/osrs/dip-detection - the pre-v1 shape.
 *
 * still here because clients already running don't redeploy when we do. an
 * analytics tab left open for hours is still executing the bundle it loaded.
 * same data, old envelope, until the logs say nobody's asking.
 *
 * new work goes to /api/v1/dip-detection.
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    // v1 dropped the 17 placeholder fields, toLegacyDip puts them back.
    const payload = await buildDips(requestId);
    return legacy({ ...payload, data: payload.data.map(toLegacyDip) }, requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
