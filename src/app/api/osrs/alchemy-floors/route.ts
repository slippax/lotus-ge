import { newRequestId, toErrorResponse } from "@/lib/errors";
import { legacy } from "@/lib/render";
import {
  buildAlchemy,
  LEGACY_METADATA,
  toLegacyAlchemy,
} from "@/lib/summaries/alchemy";

/**
 * GET /api/osrs/alchemy-floors - pre-v1 shape, frozen contract.
 * see /api/osrs/dip-detection for why.
 *
 * only legacy route with an `extra` block - the old response had four lines of
 * static prose under `metadata`. nothing reads it, hence v1 dropping it.
 *
 * new work goes to /api/v1/alchemy-floors.
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    const payload = await buildAlchemy(requestId);
    return legacy(
      { ...payload, data: payload.data.map(toLegacyAlchemy) },
      requestId,
      { metadata: LEGACY_METADATA }
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
