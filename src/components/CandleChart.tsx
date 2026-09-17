"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS, TimeScale, LinearScale, BarController, BarElement, Tooltip, type ChartOptions, type ChartEvent, type ActiveElement, type Plugin,
} from "chart.js";
import { CandlestickController, CandlestickElement, OhlcElement } from "chartjs-chart-financial";
import zoomPlugin from "chartjs-plugin-zoom";
import "chartjs-adapter-date-fns";
import { Chart } from "react-chartjs-2";
import type { Candle } from "@/lib/candles";
import { formatPrice, formatUsd } from "@/lib/format";

// chartjs-chart-financial 0.2.x reads backgroundColors/borderColors (plural) and only parses hex/rgb.
const UP = "#2f9e5f";
const DOWN = "#d64545";
const ACCENT = "108, 255, 117";

interface CrosshairState {
  x: number | null;
  y: number | null;
  targetX: number | null;
  targetY: number | null;
  alpha: number;
  targetAlpha: number;
  frame: number | null;
  color: string;
}
interface ChartWithExtras extends ChartJS {
  $crosshair?: CrosshairState;
  $selectedT?: number | null;
  $dark?: boolean;
  $onHover?: (index: number | null) => void;
  $positionBubble?: (x: number, y: number, alpha: number) => void;
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** Vertical guide that glides to the hovered candle with a dot riding its close, plus a soft band on the selected bar. */
const crosshairPlugin: Plugin<"candlestick"> = {
  id: "crosshair",
  afterEvent(chart, args) {
    const c = chart as ChartWithExtras;
    const state = (c.$crosshair ??= { x: null, y: null, targetX: null, targetY: null, alpha: 0, targetAlpha: 0, frame: null, color: UP });
    const event = args.event;
    if (event.type === "mouseout") { state.targetAlpha = 0; c.$onHover?.(null); }
    else if (event.type === "mousemove" && event.x !== null) {
      const items = chart.getElementsAtEventForMode(event as never, "index", { intersect: false }, false).filter((item) => item.datasetIndex === 0);
      const hit = items[0];
      if (hit) {
        const element = hit.element as unknown as { x: number; close: number; open: number };
        state.targetX = element.x;
        state.targetY = element.close;
        state.color = element.close <= element.open ? UP : DOWN;
        state.targetAlpha = 1;
        if (state.x === null) { state.x = element.x; state.y = element.close; }
        c.$onHover?.(hit.index);
      }
    }
    if (state.frame === null) {
      const tick = () => {
        const s = c.$crosshair!;
        if (s.targetX !== null && s.x !== null && s.targetY !== null && s.y !== null) {
          s.x = lerp(s.x, s.targetX, 0.28);
          s.y = lerp(s.y, s.targetY, 0.28);
        }
        s.alpha = lerp(s.alpha, s.targetAlpha, 0.2);
        const settled = s.targetX === null || s.x === null || (Math.abs(s.x - s.targetX) < 0.3 && Math.abs((s.y ?? 0) - (s.targetY ?? 0)) < 0.3 && Math.abs(s.alpha - s.targetAlpha) < 0.01);
        chart.draw();
        s.frame = settled ? null : requestAnimationFrame(tick);
      };
      state.frame = requestAnimationFrame(tick);
    }
  },
  afterDatasetsDraw(chart) {
    const c = chart as ChartWithExtras;
    const { ctx, chartArea, scales } = chart;
    const grid = c.$dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)";
    // selected bar: soft band plus a marker under the axis
    if (c.$selectedT != null) {
      const x = scales.x.getPixelForValue(c.$selectedT);
      if (x >= chartArea.left && x <= chartArea.right) {
        const meta = chart.getDatasetMeta(0);
        const width = Math.max(6, (meta.data[1] ? Math.abs((meta.data[1] as unknown as { x: number }).x - (meta.data[0] as unknown as { x: number }).x) : 8) * 0.9);
        ctx.save();
        ctx.fillStyle = `rgba(${ACCENT}, 0.12)`;
        ctx.fillRect(x - width / 2, chartArea.top, width, chartArea.bottom - chartArea.top);
        ctx.fillStyle = `rgba(${ACCENT}, 0.95)`;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.bottom + 2); ctx.lineTo(x - 5, chartArea.bottom + 9); ctx.lineTo(x + 5, chartArea.bottom + 9); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    const s = c.$crosshair;
    if (!s || s.x === null || s.y === null) return;
    c.$positionBubble?.(s.x, s.y, s.alpha);
    if (s.alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(s.x, chartArea.top); ctx.lineTo(s.x, chartArea.bottom); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c.$dark ? "#22292e" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  },
};

ChartJS.register(TimeScale, LinearScale, BarController, BarElement, CandlestickController, CandlestickElement, OhlcElement, Tooltip, zoomPlugin, crosshairPlugin);

function setSelected(chart: ChartJS, selectedT: number | null, dark: boolean) {
  const c = chart as ChartWithExtras;
  c.$selectedT = selectedT;
  c.$dark = dark;
  chart.draw();
}

interface Props {
  candles: Candle[];
  selectedT: number | null;
  onSelect: (t: number) => void;
  dark?: boolean;
  onZoomState?: (zoomed: boolean, reset: () => void) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");
const legendTime = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`; };

function CandleChart({ candles, selectedT, onSelect, dark = false, onZoomState }: Props) {
  const chartRef = useRef<ChartJS | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const hoverIndexRef = useRef<number | null>(null);

  /** Writes the hovered bar into the bubble directly, so hovering never re-renders React. */
  const renderBubble = (index: number | null) => {
    const node = bubbleRef.current;
    if (!node) return;
    const bar = index !== null ? candlesRef.current[index] : undefined;
    if (!bar) return;
    const color = bar.c >= bar.o ? UP : DOWN;
    node.innerHTML = [
      `<div class="text-muted-foreground">${legendTime(bar.t)}</div>`,
      `<div class="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">`,
      `<span>O <b style="color:${color}">${formatPrice(bar.o)}</b></span><span>H <b style="color:${color}">${formatPrice(bar.h)}</b></span>`,
      `<span>L <b style="color:${color}">${formatPrice(bar.l)}</b></span><span>C <b style="color:${color}">${formatPrice(bar.c)}</b></span>`,
      `</div>`,
      `<div class="mt-1">V <b>${formatUsd(bar.usd)}</b> · <b>${bar.n.toLocaleString()}</b> trades${bar.liqN ? ` · <b style="color:${DOWN}">${bar.liqN}</b> liq` : ""}</div>`,
      `<div class="mt-1 text-muted-foreground">click to open this bar</div>`,
    ].join("");
  };

  /** Rides the eased crosshair: above the close dot, flipped to the left near the right edge, clamped to the chart. */
  const positionBubble = (x: number, y: number, alpha: number) => {
    const node = bubbleRef.current;
    const chart = chartRef.current;
    if (!node || !chart) return;
    const { chartArea } = chart;
    const width = node.offsetWidth, height = node.offsetHeight;
    let left = x + 14;
    if (left + width > chartArea.right) left = x - 14 - width;
    let top = y - height - 14;
    if (top < chartArea.top) top = y + 14;
    node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    node.style.opacity = String(alpha);
  };
  const candlesRef = useRef(candles);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { candlesRef.current = candles; renderBubble(hoverIndexRef.current); });
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  const [zoomed, setZoomed] = useState(false);
  const onZoomStateRef = useRef(onZoomState);
  useEffect(() => { onZoomStateRef.current = onZoomState; }, [onZoomState]);
  useEffect(() => { onZoomStateRef.current?.(zoomed, () => { chartRef.current?.resetZoom(); setZoomed(false); }); }, [zoomed]);

  const maxVolume = useMemo(() => Math.max(1, ...candles.map((bar) => bar.usd)), [candles]);

  const data = useMemo(() => ({
    datasets: [
      {
        type: "candlestick" as const, label: "Price", yAxisID: "price", order: 1,
        data: candles.map((bar) => ({ x: bar.t, o: bar.o, h: bar.h, l: bar.l, c: bar.c })),
        backgroundColors: { up: UP, down: DOWN, unchanged: "#8a949b" },
        borderColors: { up: UP, down: DOWN, unchanged: "#8a949b" },
      },
      {
        // Volume is scaled into the data so the bars occupy the bottom quarter without any post-mount axis update.
        type: "bar" as const, label: "Volume", yAxisID: "volume", order: 2,
        data: candles.map((bar) => ({ x: bar.t, y: bar.usd / (maxVolume * 4) })),
        backgroundColor: candles.map((bar) => (bar.c >= bar.o ? "rgba(47, 158, 95, 0.22)" : "rgba(214, 69, 69, 0.22)")),
        borderWidth: 0,
      },
    ],
  }), [candles, maxVolume]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __candleChart?: ChartJS | null }).__candleChart = chartRef.current;
  });
  useEffect(() => { if (chartRef.current) setSelected(chartRef.current, selectedT, dark); }, [selectedT, dark, candles]);
  useEffect(() => {
    const chart = chartRef.current as ChartWithExtras | null;
    if (!chart) return;
    chart.$onHover = (index) => { hoverIndexRef.current = index; if (index !== null) renderBubble(index); };
    chart.$positionBubble = positionBubble;
    return () => { chart.$onHover = undefined; chart.$positionBubble = undefined; };
  });

  const options = useMemo<ChartOptions<"candlestick">>(() => {
    const grid = dark ? "rgba(255,255,255,0.08)" : "#ececec";
    const tick = dark ? "#aab3b9" : "#5d666d";
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      layout: { padding: { bottom: 10, top: 8 } },
      interaction: { mode: "index", intersect: false },
      // chartjs-chart-financial injects hover.mode "label", which no longer exists in Chart.js 4 and yields no click hits.
      hover: { mode: "index", intersect: false },
      // Select by the pointer's x through the time scale, so a click anywhere in a bar's column picks that bar
      // and selection never depends on element hit-testing.
      onClick: (event: ChartEvent, _elements: ActiveElement[], chart) => {
        if (event.x === null || event.x === undefined) return;
        const t = chart.scales.x.getValueForPixel(event.x);
        if (t === undefined) return;
        const bars = chart.data.datasets[0].data as { x: number }[];
        if (!bars.length) return;
        let nearest = bars[0];
        for (const bar of bars) if (Math.abs(bar.x - t) < Math.abs(nearest.x - t)) nearest = bar;
        onSelectRef.current(nearest.x);
      },
      onHover: (_event, elements, chart) => { chart.canvas.style.cursor = elements.length ? "pointer" : "crosshair"; },
      scales: {
        x: { type: "time", grid: { color: grid }, border: { color: grid }, ticks: { color: tick, maxRotation: 0, autoSkipPadding: 32, font: { family: "Geist Mono", size: 11 } } },
        price: { type: "linear", position: "right", grid: { color: grid }, border: { display: false }, ticks: { color: tick, font: { family: "Geist Mono", size: 11 }, callback: (value) => formatPrice(Number(value)) } },
        volume: { type: "linear", position: "left", display: false, min: 0, max: 1 },
      },
      plugins: {
        legend: { display: false },
        zoom: {
          zoom: { wheel: { enabled: true, speed: 0.1 }, pinch: { enabled: true }, mode: "x", onZoomComplete: () => setZoomed(true) },
          pan: { enabled: true, mode: "x", threshold: 6, onPanComplete: () => setZoomed(true) },
          limits: { x: { min: "original", max: "original", minRange: 5 * 60 * 1000 } },
        },
        tooltip: {
          enabled: false,
          position: "nearest",
          animation: { duration: 140, easing: "easeOutQuart" },
          backgroundColor: dark ? "rgba(34, 41, 46, 0.96)" : "rgba(255, 255, 255, 0.98)",
          titleColor: dark ? "#aab3b9" : "#5d666d",
          bodyColor: dark ? "#f4f6f7" : "#22292e",
          footerColor: dark ? "#8a949b" : "#8a949b",
          borderColor: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
          borderWidth: 1,
          cornerRadius: 6,
          padding: { top: 8, bottom: 8, left: 10, right: 10 },
          caretSize: 0,
          caretPadding: 14,
          displayColors: false,
          titleFont: { family: "Geist Mono", size: 11, weight: "normal" },
          bodyFont: { family: "Geist Mono", size: 12 },
          footerFont: { family: "Geist Mono", size: 10, weight: "normal" },
          titleMarginBottom: 6,
          bodySpacing: 3,
          footerMarginTop: 6,
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            label: (item) => {
              const bar = candlesRef.current[item.dataIndex];
              if (!bar) return "";
              return [
                `O ${formatPrice(bar.o)}   H ${formatPrice(bar.h)}`,
                `L ${formatPrice(bar.l)}   C ${formatPrice(bar.c)}`,
                `V ${formatUsd(bar.usd)} · ${bar.n.toLocaleString()} trades${bar.liqN ? ` · ${bar.liqN} liq` : ""}`,
              ];
            },
            footer: () => "click to open this bar",
          },
        },
      },
    };
  }, [dark]);

  if (!candles.length) {
    return <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-muted-foreground">No candles in this window.</div>;
  }

  return (
    <div className="relative h-full">
      {/* chartjs-chart-financial's mixed-dataset typing lags chart.js 4; the runtime shape is correct. */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Chart ref={chartRef as any} type="candlestick" data={data as any} options={options} />
      <div ref={bubbleRef} style={{ opacity: 0 }}
        className="pointer-events-none absolute left-0 top-0 min-w-[13rem] rounded-md border border-border bg-card/95 px-3 py-2 font-mono text-[11px] leading-4 tabular-nums text-foreground shadow-[var(--shadow-2)] backdrop-blur-sm [&_b]:font-normal" />
    </div>
  );
}

export default memo(CandleChart);
