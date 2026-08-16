/**
 * THE ENVELOPE IS A RENDERING CONCERN.
 *
 * This is the whole trick to supporting two API versions without forking the
 * codebase. A route does three separable things:
 *
 *   1. get the data        (src/lib/upstream.ts)
 *   2. compute the answer  (src/lib/summaries/*.ts)
 *   3. wrap it in a shape  ← this file
 *
 * Only (3) differs between versions. Once it's pulled out, a second version of
 * the whole API costs one function here plus eight lines per route — instead of
 * a parallel copy of every handler that drifts out of sync the first time you
 * fix a bug in one and forget the other.
 *
 * The rule that makes it work: **the analysis never knows which version is
 * asking.** If `buildDips()` ever takes a `version` argument, this has failed
 * and the fork has just moved somewhere less visible.
 */

import { NextResponse } from "next/server";
import { SUMMARY_CACHE } from "@/lib/upstream";

/** What every summary analysis returns, before anyone decides how to dress it. */
export interface Payload<T> {
  data: T[];
  /** ISO timestamp from the collector, or null if it didn't say. */
  updated: string | null;
  count: number;
}

function headers(requestId: string) {
  return { "Cache-Control": SUMMARY_CACHE, "x-request-id": requestId };
}

/**
 * v1 — the current shape.
 *
 * Note what's absent: `success`. The HTTP status line already carries whether
 * the request worked, and a body field that repeats it is a second source of
 * truth that will eventually disagree with the first. When it does, no client
 * knows which to believe. Errors already followed this rule (`errors.ts` emits
 * `{error:{…}}` with no boolean); this is the success side catching up.
 *
 * `cached` is gone too — it was always false, and `x-vercel-cache` answers that
 * question honestly without us maintaining it.
 */
export function v1<T>(payload: Payload<T>, requestId: string) {
  return NextResponse.json(payload, { headers: headers(requestId) });
}

/**
 * The shape this API shipped before v1 existed.
 *
 * **Treat this function as frozen.** It is not code to be improved — it's a
 * promise made to clients already running, which is the only reason the old
 * paths still exist. Every field here is preserved exactly as it was, including
 * `success: true` (redundant), `timestamp` (derived from `updated`), and
 * `dataUpdated` (the same value under a second name). Tidying any of them would
 * break the contract this function exists to keep.
 *
 * When telemetry says nobody calls the old paths any more, delete this function
 * and those routes together. That's the payoff: retiring a version becomes a
 * decision you get to make, rather than a break you inflict.
 */
export function legacy<T>(
  payload: Payload<T>,
  requestId: string,
  /**
   * Per-endpoint fields the old shape carried and this one doesn't.
   *
   * Only `alchemy-floors` uses it, for a `metadata` block of static prose about
   * the strategy. Nothing reads it, and it doesn't belong in a response body at
   * all — which is precisely why it's dropped from v1 and kept here. A frozen
   * contract keeps its warts; that's what makes it a contract.
   */
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      success: true,
      data: payload.data,
      timestamp: payload.updated
        ? new Date(payload.updated).getTime()
        : Date.now(),
      dataUpdated: payload.updated,
      count: payload.count,
      ...extra,
    },
    { headers: headers(requestId) }
  );
}
