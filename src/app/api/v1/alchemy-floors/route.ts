import { newRequestId, toErrorResponse } from "@/lib/errors";
import { v1 } from "@/lib/render";
import { buildAlchemy } from "@/lib/summaries/alchemy";

/**
 * GET /api/v1/alchemy-floors - same data as the /api/osrs one, minus `success`
 * and minus the `metadata` prose block. that's docs, not a response.
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    return v1(await buildAlchemy(requestId), requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
