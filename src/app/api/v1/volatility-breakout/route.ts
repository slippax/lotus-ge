import { newRequestId, toErrorResponse } from "@/lib/errors";
import { v1 } from "@/lib/render";
import { buildVolatility } from "@/lib/summaries/volatility";

/** GET /api/v1/volatility-breakout - clean envelope over the same data. */
export async function GET() {
  const requestId = newRequestId();

  try {
    return v1(await buildVolatility(requestId), requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
