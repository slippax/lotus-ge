"use client";

import { useState } from "react";
import { spriteUrl } from "@/lib/signals";

/**
 * not every item name maps to a wiki filename, so a miss degrades to empty
 * space rather than a broken-image box. a broken box reads as a bug, a gap
 * reads as "no picture for this one".
 */
export default function Sprite({
  name,
  size = 26,
}: {
  name: string;
  size?: number;
}) {
  /*
   * remember which url failed, not just that one did. a boolean is a trap here
   * - react reuses the instance when only `name` changes, so it stays true
   * forever and every later item in the same slot inherits the failure. the
   * hero has one sprite slot, so a single miss would blank it permanently.
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
