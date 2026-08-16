import { newRequestId, toErrorResponse } from "@/lib/errors";
import { legacy } from "@/lib/render";
import { buildAlchemy, LEGACY_METADATA } from "@/lib/summaries/alchemy";

/**
 * GET /api/osrs/alchemy-floors — the pre-v1 shape.
 *
 * Frozen contract. See /api/osrs/dip-detection for why these paths still exist.
 *
 * This is the only legacy route carrying an `extra` block: the old response
 * included four lines of static prose under `metadata`. Nothing reads it and it
 * doesn't belong in a body, which is exactly why v1 drops it and this keeps it.
 *
 * New work goes to /api/v1/alchemy-floors.
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    return legacy(await buildAlchemy(requestId), requestId, {
      metadata: LEGACY_METADATA,
    });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
