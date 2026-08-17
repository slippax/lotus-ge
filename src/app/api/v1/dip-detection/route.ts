import { newRequestId, toErrorResponse } from "@/lib/errors";
import { v1 } from "@/lib/render";
import { buildDips } from "@/lib/summaries/dips";

/**
 * GET /api/v1/dip-detection - same data as the /api/osrs one, without the
 * `success` field that duplicated the status line.
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    return v1(await buildDips(requestId), requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
