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
 * price history via tradingview's lightweight-charts. engine is theirs, look is
 * ours - everything visual comes from the globals.css tokens read at runtime.
 * the library paints to a canvas so it can't inherit css variables, and literal
 * hexes here would be the one place in the app that doesn't know its theme.
 *
 * same rules as Sparkline: colour from direction of travel, gold is chrome and
 * never data, gaps stay gaps.
 */

export interface ChartPoint {
  t: number;
  low: number | null;
}

export interface HoveredPoint {
  t: number;
  value: number;
}

/** reads a design token off the document so the chart follows the theme. */
function token(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/** tokens are 6-digit hex, the canvas needs explicit alpha for the fill. */
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
  /** 5m data wants clock times on the axis, daily wants dates. */
  intraday: boolean;
  onHover: (point: HoveredPoint | null) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  // in a ref so re-theming doesn't re-run the data effect.
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
     * applies the current theme to an existing chart. split out because it runs
     * twice - at creation, and whenever the theme flips under us.
     */
    function paint(c: IChartApi, s: ISeriesApi<"Area">) {
      const ink = token("--ink");
      const dim = token("--dim");
      const gold = token("--gold");
      const surface = token("--surface");
      const stroke = rising ? token("--up") : token("--down");

      c.applyOptions({
        layout: {
          // transparent so the modal's surface shows through and the chart
          // never carries a second slightly-wrong background.
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: dim,
          fontFamily: getComputedStyle(document.body).fontFamily,
          fontSize: 11,
          attributionLogo: false,
        },
        grid: {
          // no gridlines. the shape of the line is the message and seven
          // horizontal rules behind noisy hourly data fight it. the price
          // labels on the right still give you the scale.
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
          // magnet snaps the hairline to real points, so you aim at a day
          // rather than a 1px line.
          mode: CrosshairMode.Magnet,
          vertLine: {
            color: gold,
            width: 1,
            style: LineStyle.Solid,
            labelBackgroundColor: gold,
          },
          // price is already in the header readout, a floating axis label
          // would be the same number twice.
          horzLine: { visible: false, labelVisible: false },
        },
        localization: {
          // money is integer gp everywhere and stays that way.
          priceFormatter: (v: number) => Math.round(v).toLocaleString(),
        },
        // a modal chart that pans and zooms is one people get lost in and
        // can't reset. the range chips are the only navigation.
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
     * average across the visible window, dashed. the whole app talks in
     * "trading 35% below its 24h average" and the chart was showing the price
     * without the thing it's compared to. muted and dashed so it stays
     * reference, not data.
     *
     * no title badge - lightweight-charts draws titles inside the plot at the
     * right edge, right on top of the most recent points. the number lives in
     * the header with the rest.
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
     * a null low is a bucket where nothing traded. passing the timestamp with
     * no value makes it whitespace, so the line breaks instead of drawing a
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

    // theme can flip while the modal is open, via the toggle or the os. canvas
    // can't re-read css variables itself, so both paths have to say repaint.
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
