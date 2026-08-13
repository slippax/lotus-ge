"use client";

import { useState } from "react";
import { spriteUrl } from "@/lib/signals";

/**
 * An OSRS item sprite from the wiki.
 *
 * Not every item name maps to a wiki filename, so a miss has to degrade to
 * empty space rather than a broken-image box — a broken box reads as a bug,
 * a gap reads as "no picture for this one".
 */
export default function Sprite({
  name,
  size = 26,
}: {
  name: string;
  size?: number;
}) {
  /*
   * Remember *which* url failed, not merely that one did.
   *
   * A boolean here is a trap: React reuses this component instance when only
   * `name` changes, so a boolean stays true forever and every later item
   * rendered in the same slot inherits the failure. The hero has a single
   * sprite slot, so one missing icon would blank it permanently.
   */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = spriteUrl(name);

  if (failedSrc === src) {
    return <span style={{ width: size, height: size }} className="block shrink-0" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className="sprite block shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
