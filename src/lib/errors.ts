/**
 * one shape for every error: { error: { type, code, message, requestId } }
 * type/code are what you branch on, message is for the logs.
 *
 * no success:false - the status line already said it, and two sources of truth
 * for the same thing is how they end up disagreeing.
 */

import { NextResponse } from "next/server";

export type ErrorType =
  | "invalid_request" // 400/422, the request itself is wrong
  | "not_found" // 404, no such resource
  | "rate_limit" // 429, the client is asking too often
  | "upstream_unavailable" // 503, we're fine but our data source isn't
  | "server_error"; // 500, our bug

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
  /** 422: parsed fine, the meaning's wrong (min_roi=-5 and so on). */
  unprocessable: (code: string, message: string) =>
    new AppError(422, "invalid_request", code, message),

  notFound: (resource: string, id: string) =>
    new AppError(404, "not_found", `${resource}_not_found`, `No ${resource} with id ${id}.`),

  /**
   * 503: we're fine, github wouldn't give us the data. not the same thing as
   * "there are no dips". worth retrying unlike a 500, so it sends Retry-After.
   */
  upstreamUnavailable: (code: string, message: string, retryAfterSeconds = 30) =>
    new AppError(503, "upstream_unavailable", code, message, retryAfterSeconds),

  internal: (message = "Something went wrong on our end.") =>
    new AppError(500, "server_error", "internal_error", message),
};

/** so "the dip page was empty at 2pm" maps to one line in the logs. */
export function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * anything that isn't an AppError is a bug we didn't see coming, so it's a 500
 * and the real message stays in the logs rather than going to the client.
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
