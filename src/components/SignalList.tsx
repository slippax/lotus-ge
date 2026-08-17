"use client";

import { useState } from "react";
import { fmt, gp, KIND_LABEL, type Metric, type Signal, type SignalKind } from "@/lib/signals";
import HistoryModal from "./HistoryModal";
import Sparkline from "./Sparkline";
import Sprite from "./Sprite";

/*
 * mobile keeps the two things you decide on, price and the headline metric, and
 * drops the sparkline and secondary. `hidden md:block` on all of them meant a
 * list of names with no way to compare them.
 */
const GRID =
  "grid grid-cols-[22px_minmax(0,1fr)_auto] md:grid-cols-[34px_minmax(0,1fr)_96px_118px_96px_112px] gap-[var(--s3)] md:gap-[var(--s4)]";

const TONE: Record<string, string> = {
  up: "text-up",
  down: "text-down",
  dim: "text-line-hi",
};

/**
 * one ranked list, not six tables.
 *
 * on All the two metric columns are Return and Ceiling, the only figures
 * comparable across kinds. filter to one kind and they become that analysis's
 * own metrics, so a breakout shows band width instead of an empty Return cell
 * it was never going to fill.
 */
export default function SignalList({
  rows,
  kind,
}: {
  rows: Signal[];
  kind: "all" | SignalKind;
}) {
  const headers =
    kind === "all"
      ? ["Return", "Max profit"]
      : [rows[0]?.detail[0].k ?? "", rows[0]?.detail[1].k ?? ""];

  /*
   * which item's history is open, by name - rows carry no item id so the modal
   * resolves one itself. held here not per-row so only one chart is mounted.
   */
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <div
        className={`${GRID} items-end border-b border-line-hi pb-2 pr-2 pt-[var(--s5)] text-[11.5px] text-dim`}
      >
        <span />
        <span>Item</span>
        <span className="hidden text-right md:block">Trend</span>
        <span className="hidden text-right md:block">Buy at</span>
        <span className="hidden text-right md:block">{headers[0]}</span>
        <span className="hidden text-right md:block">{headers[1]}</span>
        <span className="text-right md:hidden">Buy at &middot; {headers[0]}</span>
      </div>

      <div className="flex flex-col">
        {rows.map((r, i) => (
          <Row
            key={r.id}
            row={r}
            rank={i + 1}
            kind={kind}
            onOpen={() => setOpen(r.name)}
          />
        ))}
      </div>

      {open && <HistoryModal name={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Row({
  row,
  rank,
  kind,
  onOpen,
}: {
  row: Signal;
  rank: number;
  kind: "all" | SignalKind;
  onOpen: () => void;
}) {
  const [a, b] =
    kind === "all"
      ? ([
          {
            k: "Return",
            v: row.roi === null ? "—" : `+${row.roi.toFixed(1)}%`,
            tone: row.roi === null ? "dim" : "up",
          },
          {
            k: "Max profit",
            v: row.ceiling === null ? "—" : gp(row.ceiling),
            tone: row.ceiling === null ? "dim" : undefined,
          },
        ] as [Metric, Metric])
      : row.detail;

  /*
   * whole row is the hit target - one item, one meaning, so a dedicated chart
   * icon would just be a smaller target. real <button> not a div with onClick
   * so it's keyboard reachable and announced as pressable.
   */
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Show price history for ${row.name}`}
      className={`${GRID} w-full cursor-pointer items-center border-b border-line py-[var(--s4)] pr-2 text-left transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--gold)]`}
    >
      <div
        className={`tnum text-right text-[15px] ${rank <= 3 ? "text-gold" : "text-dim"}`}
      >
        {rank}
      </div>

      <div className="flex min-w-0 items-center gap-[var(--s3)]">
        <Sprite name={row.name} size={28} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[15.5px] font-medium tracking-[-0.012em]">
              {row.name}
            </span>
            {kind === "all" && (
              <span className="text-[12.5px] text-dim">{KIND_LABEL[row.kind]}</span>
            )}
          </div>
          <div className="text-[13px] text-muted">
            {row.why} &middot; limit &times;{fmt(row.limit)}
          </div>
        </div>
      </div>

      <div className="hidden items-center justify-end md:flex">
        <Sparkline series={row.series} />
      </div>

      <div className="tnum hidden text-right text-[14.5px] md:block">
        {fmt(row.price)}
      </div>

      <div className="hidden md:block">
        <Cell metric={a} />
      </div>
      <div className="hidden md:block">
        <Cell metric={b} />
      </div>

      {/* Mobile: price stacked over the headline metric, right-aligned. */}
      <div className="text-right md:hidden">
        <div className="tnum text-[14px]">{fmt(row.price)}</div>
        <div
          className={`tnum text-[13px] ${a.tone ? TONE[a.tone] : "text-muted"}`}
        >
          {a.v}
        </div>
      </div>
    </button>
  );
}

function Cell({ metric }: { metric: Metric }) {
  return (
    <div
      className={`tnum hidden text-right text-[14.5px] md:block ${
        metric.tone ? TONE[metric.tone] : ""
      }`}
    >
      {metric.v}
    </div>
  );
}
