import { NextResponse } from "next/server";
import { errors, newRequestId, toErrorResponse } from "@/lib/errors";
import { getMapping, UA, WIKI } from "@/lib/wiki";

/**
 * Price history for one item.
 *
 *   GET /api/v1/items/536/history?range=1w
 *
 * A read-through cache over the OSRS wiki's timeseries API. We own no data
 * here — the value we add is (a) not hammering an upstream we don't pay for,
 * and (b) telling the truth about what happened, which the upstream does not.
 *
 * The upstream answers an unknown item with `200 {"data":[]}` — identical to a
 * real item nobody traded. Passing that through means the chart cannot tell
 * "no such item" from "quiet market", so both render as an empty box and the
 * user concludes the site is broken. Resolving the id first is what buys us a
 * real 404.
 */

/**
 * The ranges we offer.
 *
 * `range` is our vocabulary; `timestep` is the wiki's. Keeping them separate
 * means swapping data sources later doesn't change our URLs.
 *
 * The upstream returns 365 points for every timestep, whatever it is — so the
 * timestep alone picks the *resolution* and we slice to get the *window*.
 * 6h is what makes a month view 120 honest points instead of 15 days of hourly
 * ones mislabelled as a month.
 *
 * maxAge tracks what the upstream itself advertises via `Expires`: 5m data goes
 * stale in seconds, 24h data holds until midnight UTC.
 */
const RANGES = {
  "1d": { timestep: "5m", keep: 288, maxAge: 60 },
  "1w": { timestep: "1h", keep: 168, maxAge: 300 },
  "1m": { timestep: "6h", keep: 120, maxAge: 1800 },
  "1y": { timestep: "24h", keep: 365, maxAge: 3600 },
} as const;

type Range = keyof typeof RANGES;

/** One point, trimmed to what a chart actually draws. */
interface Point {
  /** Unix seconds, oldest first. */
  t: number;
  /** Buy-side average in gp, or null where nothing traded in that bucket. */
  low: number | null;
  /** Sell-side average in gp, or null. */
  high: number | null;
  /** Units traded in the bucket, both sides combined. */
  volume: number;
}

interface UpstreamPoint {
  timestamp: number;
  avgHighPrice: number | null;
  avgLowPrice: number | null;
  highPriceVolume: number | null;
  lowPriceVolume: number | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = newRequestId();

  try {
    const { id } = await params;
    const rangeParam = new URL(request.url).searchParams.get("range") ?? "1w";

    // Validate before touching the network. A bad request is our answer to
    // give — asking the wiki about "banana" wastes a round trip and, worse,
    // makes their error message our error message.
    if (!/^\d+$/.test(id)) {
      throw errors.unprocessable(
        "invalid_item_id",
        "Item id must be a positive integer."
      );
    }

    if (!(rangeParam in RANGES)) {
      throw errors.unprocessable(
        "invalid_range",
        `range must be one of: ${Object.keys(RANGES).join(", ")}.`
      );
    }

    const { timestep, keep, maxAge } = RANGES[rangeParam as Range];
    const itemId = Number(id);

    const { byId } = await getMapping(requestId);
    const item = byId.get(itemId);

    if (!item) {
      throw errors.notFound("item", id);
    }

    const upstream = await fetch(
      `${WIKI}/timeseries?id=${itemId}&timestep=${timestep}`,
      { headers: { "User-Agent": UA }, next: { revalidate: maxAge } }
    );

    // The check a naive proxy skips. Without it, `body.data` is undefined on
    // every upstream error and we cheerfully serve a 200 carrying nothing.
    if (!upstream.ok) {
      console.error(`[${requestId}] wiki timeseries ${upstream.status}`);
      throw errors.upstreamUnavailable(
        "wiki_unavailable",
        "Could not reach the OSRS price API."
      );
    }

    const body: { data?: UpstreamPoint[] } = await upstream.json();

    if (!Array.isArray(body.data)) {
      console.error(`[${requestId}] wiki returned no data array`);
      throw errors.upstreamUnavailable(
        "wiki_malformed",
        "The OSRS price API returned an unexpected shape."
      );
    }

    const points: Point[] = body.data.slice(-keep).map((p) => ({
      t: p.timestamp,
      low: p.avgLowPrice,
      high: p.avgHighPrice,
      // Prices are gp and stay integers. Volumes are counts and do too.
      volume: (p.highPriceVolume ?? 0) + (p.lowPriceVolume ?? 0),
    }));

    return NextResponse.json(
      {
        itemId,
        name: item.name,
        range: rangeParam,
        timestep,
        // An empty array HERE is now meaningful: a real item, no trades in the
        // window. The 404 above already removed the other reading.
        points,
      },
      {
        status: 200,
        headers: {
          // s-maxage caches at Vercel's edge, so a hundred readers of the same
          // chart are one request to the wiki. stale-while-revalidate serves
          // the old chart instantly while the new one is fetched behind it.
          "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
          "x-request-id": requestId,
        },
      }
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
