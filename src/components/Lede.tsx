"use client";

import { useEffect, useRef, useState } from "react";
import {
  fmt,
  gp,
  KIND_LABEL,
  KIND_LEDE,
  type Signal,
  type SignalKind,
} from "@/lib/signals";
import Sprite from "./Sprite";

/**
 * the best opportunity right now, stated rather than tabulated. a table shows
 * you data and leaves you to do the work - this answers the question you
 * arrived with, and everything below is supporting detail.
 */
/**
 * the headline figure. kinds that publish a return lead with it, the rest lead
 * with their own primary metric (band width, the month's move) rather than a
 * giant em dash.
 */
function headline(top: Signal): { text: string; label: string; animate: number | null } {
  if (top.roi !== null) {
    return { text: `${top.roi.toFixed(1)}%`, label: "Potential return", animate: top.roi };
  }
  const primary = top.detail[0];
  const parsed = parseFloat(primary.v.replace(/[^0-9.-]/g, ""));
  return {
    text: primary.v,
    label: primary.k,
    animate: Number.isFinite(parsed) ? parsed : null,
  };
}

export default function Lede({
  top,
  filter,
}: {
  top: Signal;
  /** the active chip, not `top.kind` - the eyebrow describes the list you're
   *  looking at, and on All the leader's own kind is incidental. */
  filter: "all" | SignalKind;
}) {
  const head = headline(top);
  const value = useCountUp(head.animate ?? 0, top.id);
  const ref = reference(top);

  // keep the sign and unit of the original string while animating.
  const shown =
    head.animate === null
      ? head.text
      : head.text.replace(
          /-?[\d.]+/,
          (head.animate < 0 ? -value : value).toFixed(1)
        );

  return (
    <div className="grid items-end gap-[var(--s6)] py-[var(--s4)] pb-[var(--s6)] md:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        {/*
         * a label, not a status. used to carry a pulsing dot identical to the
         * one in Freshness just above, so the two read as a matched pair of
         * live indicators. the pulse belongs to one thing only - whether prices
         * are current - so this takes the wordmark's treatment instead.
         */}
        {/*
         * a tag, not a status light. started as a pulsing gold dot which
         * competed with the Freshness dot above - same shape, same animation,
         * when only one of them is actually a state. a tint flags the section
         * instead and avoids a third hairline in a band that already has two.
         *
         * --band-bloom is the band's translucent gold. `w-fit` keeps the tint
         * on the words instead of stretching across the column.
         */}
        {/* pr is short by ~1.5px: letter-spacing is applied *after* the last
            glyph too, so a symmetric px-2 sits visibly off-centre in the tint. */}
        <div className="mb-[var(--s4)] w-fit rounded-sm bg-[var(--band-bloom)] py-1 pl-2 pr-[6.5px] text-[11px] font-medium uppercase tracking-[0.14em] text-band-gold">
          Best {filter === "all" ? "" : `${KIND_LEDE[filter]} `}opportunity right
          now
        </div>

        <div className="mb-[var(--s3)] flex items-center gap-[var(--s4)]">
          <Sprite name={top.name} size={46} />
          <h2 className="text-[clamp(28px,4.6vw,42px)] font-semibold leading-[1.05] tracking-[-0.03em] text-balance">
            {top.name}
          </h2>
        </div>

        <p className="max-w-[44ch] text-[16px] leading-relaxed text-band-mute">
          {top.why}.<br/> Buy limit is{" "}
          <b className="font-medium text-band-ink">{fmt(top.limit)}</b> every four
          hours.
        </p>

        <div className="mt-[var(--s4)] flex flex-wrap gap-[var(--s5)]">
          <Fact k="Buy at" v={fmt(top.price)} />
          {ref && <Fact k={ref.k} v={fmt(ref.v)} />}
          <Fact k="Signal" v={KIND_LABEL[top.kind]} />
        </div>
      </div>

      <div className="md:text-right">
        <div className="tnum text-[clamp(64px,12vw,124px)] font-normal leading-[0.82] tracking-[-0.06em] text-band-gold">
          {shown}
        </div>
        <div className="mt-[var(--s3)] text-[12.5px] text-band-mute">
          {head.label}
        </div>
        {top.ceiling !== null && (
          /*
           * `tnum` swaps to mono, so on the whole line the words went mono too
           * and it read as console output. figure only.
           */
          <div className="mt-1 text-[13px] text-band-mute">
            <span className="tnum text-band-ink">{gp(top.ceiling)}</span> gp at
            the buy limit
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[12.5px] text-band-mute">{k}</div>
      <div className="tnum text-[16px]">{v}</div>
    </div>
  );
}

/**
 * the comparison number is whichever end of the series isn't the buy price,
 * labelled from the row's own labels. assuming series[0] is "a month ago" holds
 * for confluence and is wrong for every other kind.
 */
function reference(s: Signal): { k: string; v: number } | null {
  if (s.series.length < 2) return null;
  const last = s.series.length - 1;
  const startIsPrice = Math.round(s.series[0]) === Math.round(s.price);
  const k = startIsPrice ? s.labels[last] : s.labels[0];
  const v = startIsPrice ? s.series[last] : s.series[0];
  if (!k) return null;
  return { k: k[0].toUpperCase() + k.slice(1), v };
}

/** only animates when the featured item changes. replaying on every sort
 *  click is noise, not feedback. */
function useCountUp(target: number, key: string) {
  const [value, setValue] = useState(target);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (lastKey.current === key) {
      setValue(target);
      return;
    }
    lastKey.current = key;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, key]);

  return value;
}
