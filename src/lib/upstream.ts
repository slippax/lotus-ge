/**
 * THE ONE PLACE WE TALK TO GITHUB.
 *
 * `collect.py` commits JSON summaries to this repo every ~5 minutes. Six routes
 * read six of those files, and until now each one carried its own copy of the
 * same forty lines — including its own copy of the same bug.
 *
 * Two rules live here, and they are the reason this file exists:
 *
 *   1. An upstream failure is a 503, never an empty list. `fetch` does not
 *      throw on a 403; if you only wrap it in try/catch you will report
 *      "no opportunities right now" when the truth is "we couldn't ask."
 *      Those are opposite situations and a client must be able to tell them
 *      apart.
 *
 *   2. Nothing here is cached in a module variable. Caching is HTTP's job
 *      (see SUMMARY_CACHE below) — a shared cache in front of the function,
 *      keyed by URL, that every visitor hits. A `let cache` inside a
 *      serverless function is per-instance and invisible to everyone else.
 */

import { errors } from "@/lib/errors";

const OWNER_REPO = "slippax/lotus-ge";
const UA = "lotus-ge (+https://github.com/slippax/lotus-ge)";

/**
 * What every summary route sends back.
 *
 * `s-maxage=60` is the whole scaling fix. The collector writes every ~5
 * minutes, so a 60-second window is fresher than the data ever is, and it
 * turns "six GitHub calls per visitor" into "six GitHub calls per minute,
 * regardless of how many visitors there are."
 *
 * `max-age=0` is deliberate: the browser revalidates every time, so a reload
 * always reflects what the shared cache holds. Without it, browsers apply
 * their own heuristic freshness and you get an unpredictable private cache on
 * top of a predictable shared one.
 *
 * `stale-while-revalidate=300` means nobody ever waits on GitHub: once the 60
 * seconds lapse, the next visitor is served the slightly-old copy instantly
 * while the refresh happens behind them.
 */
export const SUMMARY_CACHE =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

export interface Summary<T> {
  items: T[];
  updated: string | null;
}

/**
 * Local-only failure switch — nothing sets this in production.
 *
 *   UPSTREAM_FAIL=ratelimit npm run dev   GitHub 403s, as it does at 60 req/hr
 *   UPSTREAM_FAIL=garbage   npm run dev   GitHub returns 200 with nonsense
 *   UPSTREAM_FAIL=slow      npm run dev   GitHub takes 30s to answer
 *
 * You cannot trust a failure path you have never watched run. This is how you
 * watch it without waiting for a real outage.
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
 * @param label what to call this data in an error message a human will read
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
    // The API is tried first because it serves the commit's current content,
    // where raw.githubusercontent sits behind its own ~5 minute CDN cache.
    response = await upstreamFetch(apiUrl, {
      headers: {
        "User-Agent": UA,
        Accept: "application/vnd.github.v3.raw",
        "Cache-Control": "no-cache",
      },
    });

    // The API is the path with the 60-req/hr limit. The raw CDN is far more
    // permissive, so it's the spare tyre — but note the log line: running on
    // the spare indefinitely is exactly the kind of thing that stays invisible
    // until someone goes looking.
    if (!response.ok) {
      console.log(`[${requestId}] GitHub API ${response.status} for ${file}, falling back to raw`);

      // Quantised to the minute, NOT Date.now(). A per-request buster makes
      // every request a unique URL, which defeats every cache between here and
      // GitHub — the same mistake as a per-client cache-buster, one layer up.
      const minute = Math.floor(Date.now() / 60_000);
      response = await upstreamFetch(`${rawUrl}?t=${minute}`, {
        headers: { "User-Agent": UA },
      });
    }
  } catch {
    // fetch only rejects on a network-level failure: DNS, refused, timeout.
    console.error(`[${requestId}] GitHub unreachable for ${file}`);
    throw errors.upstreamUnavailable(
      "github_unreachable",
      `Could not reach GitHub to load ${label}.`
    );
  }

  // THE CHECK THAT USED TO BE MISSING. A 403/404/500 arrives here as a normal
  // resolved Response, so without this line execution simply carried on and
  // returned an empty list with a 200.
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
    // A 200 carrying something that isn't JSON — a proxy error page, a
    // truncated body. Still an upstream problem, still not our bug, so 503.
    console.error(`[${requestId}] unparseable body for ${file}`);
    throw errors.upstreamUnavailable(
      "github_malformed",
      `GitHub returned an unreadable body for ${label}.`
    );
  }

  const summary = body as { items?: unknown; updated?: unknown };

  // Shape check. Without it, `items` being undefined would sail through and
  // land as `.map is not a function` — a 500 blaming us for their bad data.
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
