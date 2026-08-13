import { NextResponse } from "next/server";
import { errors, newRequestId, toErrorResponse } from "@/lib/errors";
import { getMapping } from "@/lib/wiki";

/**
 * Items, filtered.
 *
 *   GET /api/v1/items?name=Mahogany%20logs
 *
 * This exists because of a gap in our own data: the summaries `collect.py`
 * commits identify items by display name only, with no item id anywhere. The
 * frontend therefore holds "Mahogany logs" and needs 6332 before it can ask
 * for history.
 *
 * The right long-term fix is for the collector to emit `typeid` alongside
 * `ItemName`, at which point this route becomes a convenience rather than a
 * necessity. It's worth having either way — "find me the item called X" is a
 * reasonable thing to ask an item collection.
 *
 * Note the shape: a *collection*, so a filter that matches nothing is `200`
 * with an empty array, not `404`. "No items match this filter" is a successful
 * answer to a well-formed question. That is the opposite of the single-item
 * case in ./[id]/history, where an unknown id genuinely is a 404 — and the
 * difference is worth being deliberate about, because getting it backwards is
 * how you end up with 404s that mean "empty page 3".
 */
export async function GET(request: Request) {
  const requestId = newRequestId();

  try {
    const name = new URL(request.url).searchParams.get("name");

    if (!name || name.trim().length === 0) {
      throw errors.unprocessable(
        "missing_name",
        "Provide a `name` query parameter."
      );
    }

    if (name.length > 120) {
      throw errors.unprocessable(
        "invalid_name",
        "`name` must be 120 characters or fewer."
      );
    }

    const { byName } = await getMapping(requestId);
    const match = byName.get(name.trim().toLowerCase());

    return NextResponse.json(
      {
        items: match
          ? [
              {
                id: match.id,
                name: match.name,
                limit: match.limit ?? null,
                members: match.members,
              },
            ]
          : [],
      },
      {
        status: 200,
        headers: {
          // Item identity doesn't change. Cache it hard — this lookup should
          // cost the browser nothing after the first click.
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
          "x-request-id": requestId,
        },
      }
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
