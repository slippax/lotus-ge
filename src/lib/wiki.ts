/**
 * the osrs wiki price api. everything goes through here - the item mapping
 * (~4,600 items) is needed by more than one route and fetching it twice a
 * request would be slow and rude.
 */

import { errors } from "@/lib/errors";

export const WIKI = "https://prices.runescape.wiki/api/v1/osrs";

/** anonymous requests get a cloudflare 403, not a rate-limit error. */
export const UA = "lotus-ge (+https://github.com/slippax/lotus-ge)";

export interface MappedItem {
  id: number;
  name: string;
  /** GE buy limit per 4 hours. Absent for a handful of items. */
  limit?: number;
  members: boolean;
}

/**
 * per-instance on serverless, so it's a hit-rate thing not a guarantee. fine
 * here - `next: { revalidate }` below is the real cache, this just saves
 * re-parsing 862KB of json on an instance that already did it.
 */
let cached: { byId: Map<number, MappedItem>; byName: Map<string, MappedItem> } | null =
  null;

export async function getMapping(requestId: string) {
  if (cached) return cached;

  const res = await fetch(`${WIKI}/mapping`, {
    headers: { "User-Agent": UA },
    // item metadata only changes when jagex ships content, so a day is fine.
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
    // names are unique and the summaries use the exact same strings, so exact
    // match is enough. lowercased so callers don't guess at "Monk's robe".
    byName: new Map(items.map((i) => [i.name.toLowerCase(), i])),
  };

  return cached;
}
