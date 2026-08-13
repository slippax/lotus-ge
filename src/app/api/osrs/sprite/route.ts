import { NextResponse } from "next/server";
import { errors, newRequestId, toErrorResponse } from "@/lib/errors";

/**
 * Item sprites, proxied and cached.
 *
 * Hotlinking the wiki directly from the browser means one request per row per
 * visitor — 50 sprites x every page load. The wiki throttles that (rightly),
 * and the images silently vanish.
 *
 * Proxying lets us cache hard: sprites effectively never change, so the CDN
 * and the browser can hold them for a week and the wiki sees almost nothing.
 * Same instinct as any upstream you don't own: cache it, identify yourself,
 * and fail loudly rather than silently.
 */

const WIKI = "https://oldschool.runescape.wiki/images";

async function tryFetch(file: string): Promise<Response | null> {
  const res = await fetch(`${WIKI}/${encodeURI(file)}.png`, {
    headers: {
      // Identify ourselves. An anonymous scraper is what gets blocked.
      "User-Agent": "lotus-ge (+https://github.com/slippax/lotus-ge)",
    },
    next: { revalidate: 604800 },
  });
  return res.ok ? res : null;
}

export async function GET(request: Request) {
  const requestId = newRequestId();

  try {
    const item = new URL(request.url).searchParams.get("item");

    if (!item || item.length > 120) {
      throw errors.unprocessable(
        "invalid_item",
        "Provide an `item` query parameter of 120 characters or fewer."
      );
    }

    // Stackable items (bolts, arrows, darts, javelins) are filed under a "_5"
    // suffix on the wiki — "Runite bolts" lives at "Runite_bolts_5.png".
    // Trying the plain name first and falling back covers the whole class
    // without maintaining a list of every stackable in the game.
    const base = item.replace(/ /g, "_");
    const upstream = (await tryFetch(base)) ?? (await tryFetch(`${base}_5`));

    if (!upstream) {
      throw errors.notFound("sprite", item);
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
