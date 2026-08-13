"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

/**
 * Price history, drawn by TradingView's lightweight-charts.
 *
 * The engine is theirs; the look is ours. Everything visual comes from the
 * tokens in globals.css, read at runtime — the library paints to a canvas, so
 * it can't inherit CSS variables the way the rest of the app does, and passing
 * literal hexes here would be the one place in the codebase that doesn't know
 * which theme it's in.
 *
 * Same rules as `Sparkline`: colour comes from the direction of travel, gold is
 * chrome and never data, gaps stay gaps.
 */

export interface ChartPoint {
  t: number;
  low: number | null;
}

export interface HoveredPoint {
  t: number;
  value: number;
}

/** Reads a design token off the document, so the chart follows the theme. */
function token(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/** Tokens are 6-digit hex; the canvas needs explicit alpha for the area fill. */
function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${clean}${a}`;
}

export default function PriceChart({
  points,
  intraday,
  onHover,
}: {
  points: ChartPoint[];
  /** 5-minute data wants clock times on the axis; daily data wants dates. */
  intraday: boolean;
  onHover: (point: HoveredPoint | null) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  // Held in a ref so re-theming doesn't need to re-run the data effect.
  const hover = useRef(onHover);
  hover.current = onHover;

  useEffect(() => {
    const el = holder.current;
    if (!el) return;

    const priced = points.filter((p) => p.low !== null);
    const rising =
      priced.length > 1
        ? (priced[priced.length - 1].low as number) >= (priced[0].low as number)
        : true;

    /**
     * Applies the current theme to an existing chart. Split out because it runs
     * twice: once at creation, and again whenever the theme flips underneath us.
     */
    function paint(c: IChartApi, s: ISeriesApi<"Area">) {
      const ink = token("--ink");
      const dim = token("--dim");
      const gold = token("--gold");
      const surface = token("--surface");
      const stroke = rising ? token("--up") : token("--down");

      c.applyOptions({
        layout: {
          // Transparent so the modal's own surface shows through and the chart
          // never carries a second, slightly-wrong background.
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: dim,
          fontFamily: getComputedStyle(document.body).fontFamily,
          fontSize: 11,
          attributionLogo: false,
        },
        grid: {
          // No gridlines at all. `Sparkline` established the house idiom — the
          // shape of the line is the message, and seven horizontal rules behind
          // noisy hourly data compete with it. The price labels on the right
          // still give you the scale.
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.14, bottom: 0.08 },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: intraday,
          secondsVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
        },
        crosshair: {
          // Magnet snaps the hairline to real data points, so the reader aims
          // at a day rather than at a 1px line.
          mode: CrosshairMode.Magnet,
          vertLine: {
            color: gold,
            width: 1,
            style: LineStyle.Solid,
            labelBackgroundColor: gold,
          },
          // The price is already in the header readout; a second floating label
          // on the axis would be the same number twice.
          horzLine: { visible: false, labelVisible: false },
        },
        localization: {
          // Money is integer gp everywhere in this app and stays that way.
          priceFormatter: (v: number) => Math.round(v).toLocaleString(),
        },
        // A chart in a modal that pans and zooms is a chart people get lost in
        // and can't reset. The range chips are the only navigation.
        handleScroll: false,
        handleScale: false,
      });

      s.applyOptions({
        lineColor: stroke,
        lineWidth: 2,
        topColor: withAlpha(stroke, 0.22),
        bottomColor: withAlpha(stroke, 0),
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: surface,
        crosshairMarkerBorderWidth: 2,
        crosshairMarkerBackgroundColor: stroke,
      });

      c.applyOptions({ rightPriceScale: { textColor: ink } });
    }

    const c = createChart(el, { autoSize: true, height: 300 });
    const s = c.addSeries(AreaSeries, {});
    chart.current = c;
    series.current = s;

    paint(c, s);

    /*
     * The average across the visible window, as a dashed reference.
     *
     * The whole app talks in "trading 35% below its 24-hour average", and until
     * now the chart showed the price without the thing it's being compared to.
     * With the line there, "is this actually cheap" is a glance rather than a
     * calculation. Muted and dashed so it stays reference, not data.
     *
     * No title badge and no axis label: lightweight-charts draws the title
     * inside the plot at the right edge, which lands squarely on the most
     * recent points — the part you're most likely to be reading. The number
     * lives in the header instead, with the rest of the figures.
     */
    if (priced.length > 1) {
      const mean =
        priced.reduce((sum, p) => sum + (p.low as number), 0) / priced.length;

      s.createPriceLine({
        price: Math.round(mean),
        color: token("--line-hi"),
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });
    }

    /*
     * A null low is a bucket where nothing traded. Passing the timestamp with
     * no value makes it whitespace: the line breaks rather than drawing a
     * straight invented price across hours that had none.
     */
    s.setData(
      points.map((p) =>
        p.low === null
          ? { time: p.t as UTCTimestamp }
          : { time: p.t as UTCTimestamp, value: p.low },
      ),
    );

    c.timeScale().fitContent();

    c.subscribeCrosshairMove((param) => {
      const value = param.seriesData.get(s) as { value?: number } | undefined;
      if (!param.time || value?.value === undefined) {
        hover.current(null);
        return;
      }
      hover.current({ t: param.time as number, value: value.value });
    });

    // The theme can flip while the modal is open — via the toggle (which sets
    // data-theme) or the OS. Canvas can't re-read CSS variables on its own, so
    // both paths have to tell it to repaint.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const repaint = () => paint(c, s);
    media.addEventListener("change", repaint);
    const observer = new MutationObserver(repaint);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      media.removeEventListener("change", repaint);
      observer.disconnect();
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, [points, intraday]);

  return <div ref={holder} className="h-[300px] w-full" />;
}
