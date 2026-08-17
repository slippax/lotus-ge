import { NextResponse } from "next/server";
import { errors, newRequestId, toErrorResponse } from "@/lib/errors";
import { getMapping, UA, WIKI } from "@/lib/wiki";

/**
 * GET /api/v1/items/536/history?range=1w
 *
 * read-through cache over the wiki's timeseries api. we own none of this data -
 * what we add is not hammering an upstream we don't pay for, and being honest
 * about what happened, which the upstream isn't.
 *
 * the wiki answers an unknown item with 200 {"data":[]}, same as a real item
 * nobody traded. pass that through and the chart can't tell "no such item" from
 * "quiet market" - both render as an empty box and it looks broken. resolving
 * the id first is what buys us a real 404.
 */

/**
 * `range` is our vocabulary, `timestep` is the wiki's. keeping them separate
 * means swapping data sources doesn't change our urls.
 *
 * the wiki returns 365 points for every timestep, so timestep picks the
 * resolution and we slice for the window. 6h is what makes the month view 120
 * real points instead of 15 days of hourly ones labelled as a month.
 *
 * maxAge follows what the upstream advertises via Expires.
 */
const RANGES = {
  "1d": { timestep: "5m", keep: 288, maxAge: 60 },
  "1w": { timestep: "1h", keep: 168, maxAge: 300 },
  "1m": { timestep: "6h", keep: 120, maxAge: 1800 },
  "1y": { timestep: "24h", keep: 365, maxAge: 3600 },
} as const;

type Range = keyof typeof RANGES;

/** one point, trimmed to what a chart actually draws. */
interface Point {
  /** unix seconds, oldest first. */
  t: number;
  /** buy-side average in gp, null if nothing traded in the bucket. */
  low: number | null;
  /** sell-side average in gp, or null. */
  high: number | null;
  /** units traded in the bucket, both sides. */
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

    // validate before touching the network - asking the wiki about "banana"
    // wastes a round trip and makes their error message ours.
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

    // the check a naive proxy skips. without it body.data is undefined on
    // every upstream error and we serve a 200 carrying nothing.
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
      // gp and counts, both stay integers.
      volume: (p.highPriceVolume ?? 0) + (p.lowPriceVolume ?? 0),
    }));

    return NextResponse.json(
      {
        itemId,
        name: item.name,
        range: rangeParam,
        timestep,
        // empty here is meaningful now - real item, no trades in the window.
        // the 404 above already ruled out the other reading.
        points,
      },
      {
        status: 200,
        headers: {
          // s-maxage caches at the edge, so a hundred readers of the same
          // chart are one request to the wiki.
          "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
          "x-request-id": requestId,
        },
      }
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
