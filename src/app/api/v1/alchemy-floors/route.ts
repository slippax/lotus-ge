import { newRequestId, toErrorResponse } from "@/lib/errors";
import { v1 } from "@/lib/render";
import { buildAlchemy } from "@/lib/summaries/alchemy";

/**
 * GET /api/v1/alchemy-floors
 *
 * Same data as /api/osrs/alchemy-floors, without `success` and without the
 * `metadata` block of static prose — that's documentation, not a response.
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    return v1(await buildAlchemy(requestId), requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
