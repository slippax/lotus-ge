/**
 * just the response wrapping - fetching is upstream.ts, analysis is
 * summaries/*.ts. only this bit differs between versions, so v2 costs one
 * function here instead of a parallel copy of every route.
 *
 * keep the analysis ignorant of who's asking. if buildDips() ever takes a
 * `version` arg the fork has just moved somewhere harder to spot.
 */

import { NextResponse } from "next/server";
import { SUMMARY_CACHE } from "@/lib/upstream";

export interface Payload<T> {
  data: T[];
  /** ISO timestamp from the collector, null if it didn't say. */
  updated: string | null;
  count: number;
}

function headers(requestId: string) {
  return { "Cache-Control": SUMMARY_CACHE, "x-request-id": requestId };
}

/**
 * v1. no `success` - errors.ts already worked this way, this is the happy path
 * catching up. `cached` is gone too, it was hardcoded false and x-vercel-cache
 * answers that properly anyway.
 */
export function v1<T>(payload: Payload<T>, requestId: string) {
  return NextResponse.json(payload, { headers: headers(requestId) });
}

/**
 * the shape we shipped before v1. frozen, don't tidy it - `success: true` is
 * redundant, `timestamp` is `updated` as epoch ms and `dataUpdated` is the same
 * value again under another name. all three stay, clients are already on them.
 *
 * delete this and the /api/osrs routes together once nothing calls them.
 */
export function legacy<T>(
  payload: Payload<T>,
  requestId: string,
  /** only alchemy-floors uses this, for a `metadata` block nothing reads. */
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
