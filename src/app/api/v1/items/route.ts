import { NextResponse } from "next/server";
import { errors, newRequestId, toErrorResponse } from "@/lib/errors";
import { getMapping } from "@/lib/wiki";

/**
 * GET /api/v1/items?name=Mahogany%20logs
 *
 * exists because of a gap in our own data - the summaries collect.py commits
 * only have display names, no ids. so the frontend holds "Mahogany logs" and
 * needs 6332 before it can ask for history. real fix is the collector emitting
 * typeid, then this is just a convenience.
 *
 * it's a collection, so no match is 200 + empty array, not a 404. opposite of
 * ./[id]/history where an unknown id really is a 404. getting that backwards is
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
          // item identity doesn't change, so cache it hard.
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
          "x-request-id": requestId,
        },
      }
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
