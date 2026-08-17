import { newRequestId, toErrorResponse } from "@/lib/errors";
import { v1 } from "@/lib/render";
import { buildConfluence } from "@/lib/summaries/confluence";

/** GET /api/v1/confluence - same data as the /api/osrs one, clean envelope. */
export async function GET() {
  const requestId = newRequestId();

  try {
    return v1(await buildConfluence(requestId), requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
