/**
 * The OSRS wiki price API — the one upstream we don't own.
 *
 * Everything that talks to it goes through here, for one reason: the item
 * mapping (~4,600 items) is needed by more than one route, and fetching it
 * twice per request would be both slow and rude.
 */

import { errors } from "@/lib/errors";

export const WIKI = "https://prices.runescape.wiki/api/v1/osrs";

/**
 * Anonymous requests get a Cloudflare challenge (403), not a rate-limit error.
 * Identifying yourself with a contact address is the entire price of admission.
 */
export const UA = "lotus-ge (+https://github.com/slippax/lotus-ge)";

export interface MappedItem {
  id: number;
  name: string;
  /** GE buy limit per 4 hours. Absent for a handful of items. */
  limit?: number;
  members: boolean;
}

/**
 * Module-level cache of the mapping.
 *
 * The same caveat as the 5-second caches elsewhere in this repo applies — on
 * serverless this is per-instance, so it's a hit-rate optimisation and never a
 * correctness guarantee. That's fine here: `next: { revalidate }` on the fetch
 * is the real cache, and this only saves re-parsing 862KB of JSON on an
 * instance that already has it.
 */
let cached: { byId: Map<number, MappedItem>; byName: Map<string, MappedItem> } | null =
  null;

export async function getMapping(requestId: string) {
  if (cached) return cached;

  const res = await fetch(`${WIKI}/mapping`, {
    headers: { "User-Agent": UA },
    // Item metadata changes only when Jagex ships content. A day is generous
    // and still means we ask for this at most once per day per region.
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    console.error(`[${requestId}] wiki mapping failed: ${res.status}`);
    throw errors.upstreamUnavailable(
      "wiki_unavailable",
      "Could not reach the OSRS price API."
    );
  }

  const items: MappedItem[] = await res.json();

  cached = {
    byId: new Map(items.map((i) => [i.id, i])),
    // Names are unique in the mapping and the summaries carry the exact same
    // strings, so an exact-match lookup is enough. Lowercased so a caller
    // doesn't have to guess the capitalisation of "Monk's robe".
    byName: new Map(items.map((i) => [i.name.toLowerCase(), i])),
  };

  return cached;
}
