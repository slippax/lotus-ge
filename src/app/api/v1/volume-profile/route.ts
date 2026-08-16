import { newRequestId, toErrorResponse } from "@/lib/errors";
import { v1 } from "@/lib/render";
import { buildVolume } from "@/lib/summaries/volume";

/** GET /api/v1/volume-profile — clean envelope over the same data. */
export async function GET() {
  const requestId = newRequestId();

  try {
    return v1(await buildVolume(requestId), requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
