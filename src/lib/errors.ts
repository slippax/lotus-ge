/**
 * ONE ERROR SHAPE FOR THE WHOLE API.
 *
 * Every error this API emits looks like:
 *
 *   {
 *     "error": {
 *       "type": "upstream_unavailable",   <- machine-readable category
 *       "code": "github_unavailable",     <- machine-readable specific cause
 *       "message": "Could not reach ...", <- for a human reading logs
 *       "requestId": "req_a1b2c3d4"       <- what a bug report quotes
 *     }
 *   }
 *
 * Note what is NOT here: a `success: false` field. The HTTP status line already
 * says whether it worked. Two sources of truth for "did this work" eventually
 * disagree, and then nobody knows which to believe.
 */

import { NextResponse } from "next/server";

export type ErrorType =
  | "invalid_request" // 400/422 — the request itself is wrong
  | "not_found" // 404 — no such resource
  | "rate_limit" // 429 — the *client* is asking too often
  | "upstream_unavailable" // 503 — we're fine, our data source isn't
  | "server_error"; // 500 — our bug

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly type: ErrorType,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  /** 422: the request parsed fine, the *meaning* is wrong (e.g. min_roi=-5). */
  unprocessable: (code: string, message: string) =>
    new AppError(422, "invalid_request", code, message),

  notFound: (resource: string, id: string) =>
    new AppError(404, "not_found", `${resource}_not_found`, `No ${resource} with id ${id}.`),

  /**
   * 503: the distinction this API has been missing. We are up; GitHub would not
   * give us the data. Crucially NOT the same as "there are no dips" — and
   * unlike a 500, it is worth retrying, which is why it carries Retry-After.
   */
  upstreamUnavailable: (code: string, message: string, retryAfterSeconds = 30) =>
    new AppError(503, "upstream_unavailable", code, message, retryAfterSeconds),

  internal: (message = "Something went wrong on our end.") =>
    new AppError(500, "server_error", "internal_error", message),
};

/** Correlates a user's "the dip page was empty at 2pm" to one line in the logs. */
export function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * Turns any thrown value into the one envelope. Anything that isn't an
 * AppError is a bug we didn't anticipate, so it becomes a 500 — and its real
 * message goes to the logs, never to the client.
 */
export function toErrorResponse(err: unknown, requestId: string): NextResponse {
  const appError =
    err instanceof AppError ? err : errors.internal();

  if (!(err instanceof AppError)) {
    console.error(`[${requestId}] unhandled error:`, err);
  } else {
    console.error(`[${requestId}] ${appError.status} ${appError.code}: ${appError.message}`);
  }

  const headers: Record<string, string> = { "x-request-id": requestId };
  if (appError.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(appError.retryAfterSeconds);
  }

  return NextResponse.json(
    {
      error: {
        type: appError.type,
        code: appError.code,
        message: appError.message,
        requestId,
      },
    },
    { status: appError.status, headers }
  );
}
