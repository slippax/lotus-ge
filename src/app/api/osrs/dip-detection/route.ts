import { newRequestId, toErrorResponse } from "@/lib/errors";
import { legacy } from "@/lib/render";
import { buildDips, toLegacyDip } from "@/lib/summaries/dips";

/**
 * GET /api/osrs/dip-detection — the pre-v1 shape.
 *
 * Kept because clients that are already running don't get redeployed when we
 * do. An analytics tab left open for hours is executing the JS bundle it
 * loaded, and there is no way to reach into it — you can update a server
 * atomically, you can never update your clients atomically, and you usually
 * can't even count them.
 *
 * So this path keeps its promise instead: same data, old envelope, forever, or
 * at least until logs show nobody is asking for it. The analysis itself lives
 * in one place (`buildDips`) and both versions call it, so this costs eight
 * lines rather than a second copy of anything that matters.
 *
 * New work goes to /api/v1/dip-detection.
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    // v1 dropped the 17 placeholder fields; toLegacyDip puts them back, so
    // this path still answers exactly as it did before they were removed.
    const payload = await buildDips(requestId);
    return legacy({ ...payload, data: payload.data.map(toLegacyDip) }, requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
