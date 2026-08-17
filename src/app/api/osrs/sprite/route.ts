import { NextResponse } from "next/server";
import { errors, newRequestId, toErrorResponse } from "@/lib/errors";

/**
 * item sprites, proxied and cached.
 *
 * hotlinking the wiki from the browser is one request per row per visitor - 50
 * sprites every page load. the wiki throttles that, rightly, and the images
 * quietly vanish.
 *
 * proxying lets us cache hard. sprites never change, so the cdn and browser
 * hold them a week and the wiki barely sees us.
 */

const WIKI = "https://oldschool.runescape.wiki/images";

async function tryFetch(file: string): Promise<Response | null> {
  const res = await fetch(`${WIKI}/${encodeURI(file)}.png`, {
    headers: {
      // identify ourselves, anonymous scrapers are what get blocked.
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

    // stackables (bolts, arrows, darts, javelins) are filed under a "_5"
    // suffix - "Runite bolts" is at "Runite_bolts_5.png". trying plain first
    // and falling back covers the lot without maintaining a list.
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
