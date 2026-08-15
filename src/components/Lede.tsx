"use client";

import { useEffect, useRef, useState } from "react";
import { fmt, gp, KIND_LABEL, type Signal } from "@/lib/signals";
import Sprite from "./Sprite";

/**
 * The best opportunity right now, stated rather than tabulated.
 *
 * A table shows you data and leaves you to do the work. This answers the
 * question the user actually arrived with, and everything below it is the
 * supporting detail.
 */
/**
 * The headline figure. Kinds that publish a return lead with it; the rest lead
 * with their own primary metric (a breakout's band width, a confluence run's
 * move over the month) rather than a giant em dash.
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

export default function Lede({ top }: { top: Signal }) {
  const head = headline(top);
  const value = useCountUp(head.animate ?? 0, top.id);
  const ref = reference(top);

  // Preserve the sign and unit of the original string while animating.
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
        <div className="mb-[var(--s4)] flex items-center gap-2 text-[12.5px] text-band-gold">
          <span className="h-1.5 w-1.5 animate-[lotus-pulse_2.8s_ease-in-out_infinite] rounded-full bg-[var(--band-gold)]" />
          Best opportunity right now
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
          <div className="tnum mt-0.5 text-[14px] text-band-ink">
            {gp(top.ceiling)} gp at the buy limit
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
 * The comparison number is whichever end of the series isn't the buy price,
 * labelled from the row's own labels — assuming series[0] is always "a month
 * ago" is true for confluence rows and wrong for every other kind.
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

/** Animates only when the featured item changes — replaying it on every sort
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
