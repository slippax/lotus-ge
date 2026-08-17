/**
 * everything that talks to github. collect.py commits the summaries here every
 * ~5 min and six routes read them. each route used to carry its own copy of
 * these forty lines, bug included.
 *
 * two things not to undo:
 *
 * upstream failure is a 503, never an empty list. fetch doesn't throw on a 403,
 * so a bare try/catch says "no opportunities right now" when it means "we
 * couldn't ask".
 *
 * no module-level cache. `let cache` in a serverless function is per-instance
 * and invisible to everyone else. SUMMARY_CACHE below does it properly.
 */

import { errors } from "@/lib/errors";

const OWNER_REPO = "slippax/lotus-ge";
const UA = "lotus-ge (+https://github.com/slippax/lotus-ge)";

/**
 * unauth github is 60/hr per IP, and on vercel that IP is shared with other
 * customers so it isn't even our budget. a token gets 5,000/hr in our own
 * bucket - the isolation matters more than the ceiling.
 *
 * needs no scopes, the limit lifts just because the request is authenticated.
 *
 * optional so dev works without one, but note a single /analytics load is 6
 * calls, so 60/hr is ~10 page loads before you quietly drop to the raw fallback.
 */
function authHeader(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * cache header for the six summary routes.
 *
 * s-maxage=60 is the scaling fix. collector only writes every ~5 min so 60s is
 * fresher than the data ever gets, and it turns six github calls per visitor
 * into six per minute regardless of traffic.
 *
 * max-age=0 keeps the browser revalidating - without it you get its heuristic
 * freshness as an unpredictable private cache on top of a predictable shared one.
 *
 * stale-while-revalidate=300 so nobody waits on github.
 */
export const SUMMARY_CACHE =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

export interface Summary<T> {
  items: T[];
  updated: string | null;
}

/**
 * local failure switch, nothing sets this in prod.
 *
 *   UPSTREAM_FAIL=ratelimit npm run dev   403, like github at 60/hr
 *   UPSTREAM_FAIL=garbage   npm run dev   200 with a body that isn't json
 *   UPSTREAM_FAIL=slow      npm run dev   30s to answer
 *
 * lets you watch the failure paths without waiting for a real outage.
 * `npm run tour` picks the mode up and demos it.
 */
async function upstreamFetch(url: string, init?: RequestInit): Promise<Response> {
  const mode = process.env.UPSTREAM_FAIL;

  if (mode === "ratelimit") {
    console.log(`UPSTREAM_FAIL=ratelimit -> 403 for ${url}`);
    return new Response(
      JSON.stringify({
        message: "API rate limit exceeded for 10.0.0.152.",
        documentation_url: "https://docs.github.com/rest/overview/rate-limits",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (mode === "garbage") {
    console.log(`UPSTREAM_FAIL=garbage -> malformed body for ${url}`);
    return new Response("<!DOCTYPE html><html>not json</html>", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (mode === "slow") {
    console.log(`UPSTREAM_FAIL=slow -> 30s delay for ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }

  return fetch(url, init);
}

/**
 * Fetch one summary file, or throw.
 *
 * @param file  filename under data/summaries/, e.g. "dipped-items.json"
 * @param label what to call this data in an error a human will read
 */
export async function fetchSummary<T>(
  file: string,
  label: string,
  requestId: string
): Promise<Summary<T>> {
  const apiUrl = `https://api.github.com/repos/${OWNER_REPO}/contents/data/summaries/${file}`;
  const rawUrl = `https://raw.githubusercontent.com/${OWNER_REPO}/main/data/summaries/${file}`;

  let response: Response;

  try {
    // api first - it serves the commit's current content, raw sits behind its
    // own ~5 min CDN cache.
    response = await upstreamFetch(apiUrl, {
      headers: {
        "User-Agent": UA,
        Accept: "application/vnd.github.v3.raw",
        "Cache-Control": "no-cache",
        ...authHeader(),
      },
    });

    // raw is the spare tyre, way more permissive. hence the log line - sitting
    // on the spare for weeks is the sort of thing nobody notices. a 401/403
    // here while GITHUB_TOKEN is set means the token's wrong.
    //
    // if this repo goes private, raw needs auth too and stops being an
    // independent fallback. see docs/03-going-private.md.
    if (!response.ok) {
      const tokenNote =
        process.env.GITHUB_TOKEN && (response.status === 401 || response.status === 403)
          ? " - check GITHUB_TOKEN, it may be expired or malformed"
          : "";
      console.log(
        `[${requestId}] GitHub API ${response.status} for ${file}, falling back to raw${tokenNote}`
      );

      // quantised to the minute, not Date.now() - a per-request buster makes
      // every URL unique and defeats every cache between here and github.
      const minute = Math.floor(Date.now() / 60_000);
      response = await upstreamFetch(`${rawUrl}?t=${minute}`, {
        headers: { "User-Agent": UA },
      });
    }
  } catch {
    // fetch only rejects on network-level stuff: dns, refused, timeout.
    console.error(`[${requestId}] GitHub unreachable for ${file}`);
    throw errors.upstreamUnavailable(
      "github_unreachable",
      `Could not reach GitHub to load ${label}.`
    );
  }

  // the check that used to be missing. a 403/404/500 lands here as a perfectly
  // normal resolved Response, so without this we carried on and served an empty
  // list with a 200.
  if (!response.ok) {
    console.error(`[${requestId}] GitHub ${response.status} for ${file}`);
    throw errors.upstreamUnavailable(
      "github_unavailable",
      `GitHub returned ${response.status} when loading ${label}.`
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // 200 carrying something that isn't json - proxy error page, truncated
    // body. their problem, not ours, so still a 503.
    console.error(`[${requestId}] unparseable body for ${file}`);
    throw errors.upstreamUnavailable(
      "github_malformed",
      `GitHub returned an unreadable body for ${label}.`
    );
  }

  const summary = body as { items?: unknown; updated?: unknown };

  // without this an undefined `items` sails through and turns up later as
  // ".map is not a function" - a 500 blaming us for their bad data.
  if (!Array.isArray(summary.items)) {
    console.error(`[${requestId}] no items array for ${file}`);
    throw errors.upstreamUnavailable(
      "github_malformed",
      `GitHub returned an unexpected shape for ${label}.`
    );
  }

  return {
    items: summary.items as T[],
    updated: typeof summary.updated === "string" ? summary.updated : null,
  };
}
