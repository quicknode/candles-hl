"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { INTERVALS, defaultReplaySpeed, fillsCandleQuery, mergeCandles, rowsToCandles, venuePublishes, windowFor, type Candle, type Interval } from "@/lib/candles";
import { fillsForBarQuery, rowsToFills, type Fill } from "@/lib/anatomy";
import { runSql } from "@/lib/sql";
import { fetchOfficialCandles } from "@/lib/venue";
import { useReplay } from "@/lib/replay";
import { useAppearance } from "@/lib/appearance";
import Builder from "@/components/Builder";
import Tape from "@/components/Tape";
import Steps, { STEP_IDS, type StepId } from "@/components/Steps";
import Panel from "@/components/Panel";
import { BuilderSkeleton, ChartSkeleton, StepsSkeleton, TapeSkeleton } from "@/components/Skeleton";

const CandleChart = dynamic(() => import("@/components/CandleChart"), { ssr: false });

const COINS = ["HYPE", "BTC", "ETH", "SOL", "XRP", "DOGE"];
const BARS = 240;
const REFRESH_MS = 15_000;
const TOUR_MS = 9_000;
/** A HYPE minute with a liquidation cascade: 2,855 fills, 135 liquidations, the low moves 12 ticks. */
const EXAMPLE = { coin: "HYPE", interval: "1m" as Interval, barT: Date.UTC(2026, 8, 15, 18, 45) };

interface Series { key: string; candles: Candle[]; official: Candle[]; start: number; end: number; credits: number; error?: string }
interface BarDetail { key: string; fills: Fill[]; credits: number; error?: string }

export default function App() {
  const { appearance, toggle: toggleAppearance } = useAppearance("dark");
  const [ready, setReady] = useState(false);
  const [coin, setCoin] = useState(EXAMPLE.coin);
  const [interval, setInterval] = useState<Interval>("1m");
  const [anchor, setAnchor] = useState<number | null>(null);
  const [selectedT, setSelectedT] = useState<number | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [detail, setDetail] = useState<BarDetail | null>(null);
  const [step, setStep] = useState<StepId>("blocks");
  const [tour, setTour] = useState(false);
  const [followLive, setFollowLive] = useState(false);

  const [creditsUsed, setCreditsUsed] = useState(0);
  const [zoom, setZoom] = useState<{ zoomed: boolean; reset: () => void }>({ zoomed: false, reset: () => undefined });
  const onZoomState = useCallback((zoomed: boolean, reset: () => void) => setZoom({ zoomed, reset }), []);

  useEffect(() => {
    const now = Date.now();
    const frame = requestAnimationFrame(() => { setAnchor(now); setReady(true); });
    return () => cancelAnimationFrame(frame);
  }, []);
  const window_ = useMemo(() => windowFor(interval, BARS, anchor ?? 0), [interval, anchor]);
  const seriesKey = `${coin}|${interval}|${window_.end}`;

  useEffect(() => {
    if (!ready || anchor === null) return;
    let cancelled = false;
    (async () => {
      try {
        const [result, official] = await Promise.all([
          runSql<never>(fillsCandleQuery(coin, interval, window_.start, window_.end)),
          venuePublishes(interval) ? fetchOfficialCandles(coin, interval, window_.start, window_.end).catch(() => [] as Candle[]) : Promise.resolve([] as Candle[]),
        ]);
        if (cancelled) return;
        const candles = rowsToCandles(result.data, "fills");
        setSeries({ key: seriesKey, candles, official, start: window_.start, end: window_.end, credits: result.credits ?? 0 });
        setCreditsUsed((total) => total + (result.credits ?? 0));
        setSelectedT((current) => {
          if (current !== null && candles.some((bar) => bar.t === current)) return current;
          return (candles.length > 1 ? candles[candles.length - 2] : candles[candles.length - 1])?.t ?? null;
        });
      } catch (error) {
        if (!cancelled) setSeries({ key: seriesKey, candles: [], official: [], start: window_.start, end: window_.end, credits: 0, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => { cancelled = true; };
  }, [ready, anchor, coin, interval, window_.start, window_.end, seriesKey]);

  const currentSeries = series?.key === seriesKey ? series : null;

  // Keep the chart alive: re-query only the last two bars, and the venue's, on a timer.
  useEffect(() => {
    if (!currentSeries || currentSeries.error || anchor === null || Date.now() - window_.end > INTERVALS[interval].seconds * 1000) return;
    const step = INTERVALS[interval].seconds * 1000;
    const timer = window.setInterval(async () => {
      const lastOpen = currentSeries.candles.length ? currentSeries.candles[currentSeries.candles.length - 1].t : window_.start;
      const since = Math.max(window_.start, lastOpen - step);
      const end = windowFor(interval, 1, Date.now()).end;
      try {
        const [result, official] = await Promise.all([
          runSql<never>(fillsCandleQuery(coin, interval, since, end)),
          venuePublishes(interval) ? fetchOfficialCandles(coin, interval, since, end).catch(() => [] as Candle[]) : Promise.resolve([] as Candle[]),
        ]);
        const fresh = rowsToCandles(result.data, "fills");
        setCreditsUsed((total) => total + (result.credits ?? 0));
        setSeries((current) => current && current.key === seriesKey
          ? { ...current, candles: mergeCandles(current.candles, fresh), official: mergeCandles(current.official, official) }
          : current);
      } catch { /* next tick retries */ }
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [currentSeries, anchor, coin, interval, window_.start, window_.end, seriesKey]);

  const [now, setNow] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const formingBar = now > 0 ? windowFor(interval, 1, now).end - INTERVALS[interval].seconds * 1000 : null;
  // Live mode follows the clock: the selection is whatever bar is forming right now.
  const selected = followLive && formingBar !== null ? formingBar : selectedT;
  const liveBar = selected !== null && selected === formingBar;

  const detailKey = selected === null ? null : `${coin}|${interval}|${selected}`;
  useEffect(() => {
    if (selected === null || !detailKey) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await runSql<never>(fillsForBarQuery(coin, interval, selected));
        if (cancelled) return;
        setDetail({ key: detailKey, fills: rowsToFills(result.data), credits: result.credits ?? 0 });
        setCreditsUsed((total) => total + (result.credits ?? 0));
      } catch (error) {
        if (!cancelled) setDetail({ key: detailKey, fills: [], credits: 0, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => { cancelled = true; };
  }, [coin, interval, selected, detailKey]);

  const currentDetail = detail?.key === detailKey ? detail : null;
  const fills = useMemo(() => currentDetail?.fills ?? [], [currentDetail]);

  // The forming bar keeps pulling its own fills so the builder and tape stay live.
  useEffect(() => {
    if (!liveBar || selected === null || !detailKey) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await runSql<never>(fillsForBarQuery(coin, interval, selected));
        setDetail((current) => current?.key === detailKey ? { ...current, fills: rowsToFills(result.data) } : current);
        setCreditsUsed((total) => total + (result.credits ?? 0));
      } catch { /* next tick retries */ }
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [liveBar, coin, interval, selected, detailKey]);
  const fillTimes = useMemo(() => fills.map((fill) => fill.t), [fills]);
  const replay = useReplay(fillTimes, {
    barStart: selected ?? 0, barSpan: INTERVALS[interval].seconds * 1000, durationMs: INTERVALS[interval].seconds * 1000,
    initialSpeed: defaultReplaySpeed(interval), loop: true, holdMs: 3000, live: liveBar,
  });
  const selectBar = useCallback((t: number) => { setFollowLive(false); setSelectedT(t); }, []);
  const leaveLive = useCallback(() => {
    if (formingBar !== null) setSelectedT(formingBar - INTERVALS[interval].seconds * 1000);
    setFollowLive(false);
  }, [formingBar, interval]);
  const toggleTour = useCallback(() => setTour((current) => !current), []);
  const officialBar = currentSeries && selected !== null ? currentSeries.official.find((bar) => bar.t === selected) ?? null : null;

  // Auto tour: advance the tabs on a timer while the replay loops. For recording.
  useEffect(() => {
    if (!tour) return;
    const timer = window.setInterval(() => setStep((current) => STEP_IDS[(STEP_IDS.indexOf(current) + 1) % STEP_IDS.length]), TOUR_MS);
    return () => window.clearInterval(timer);
  }, [tour]);

  /** Select the bar that is forming right now; the builder and tape go live. */
  const goLive = () => {
    const step = INTERVALS[interval].seconds * 1000;
    const current = Date.now();
    setAnchor(current);
    setSelectedT(windowFor(interval, 1, current).end - step);
    setFollowLive(true);
  };

  const loadExample = () => {
    setFollowLive(false);
    setCoin(EXAMPLE.coin); setInterval(EXAMPLE.interval);
    setAnchor(EXAMPLE.barT + INTERVALS[EXAMPLE.interval].seconds * 1000 * 40);
    setSelectedT(EXAMPLE.barT); setStep("blocks");
  };

  const isExample = coin === EXAMPLE.coin && interval === EXAMPLE.interval && selected === EXAMPLE.barT && !followLive;
  const mode: "replay" | "live" | "example" = followLive ? "live" : isExample ? "example" : "replay";
  const modeSelect = (
    <label className="flex items-center gap-2">
      <span className="eyebrow">mode</span>
      <select value={mode} onChange={(e) => { const next = e.target.value; if (next === "live") goLive(); else if (next === "example") loadExample(); else leaveLive(); }}
        className="h-7 rounded-sm border border-border bg-background px-2 font-mono text-xs text-foreground">
        <option value="replay">replay a bar</option>
        <option value="live">follow live</option>
        <option value="example">example: liquidation cascade</option>
      </select>
    </label>
  );

  const chartMeta = currentSeries && !currentSeries.error ? (
    <>
      <span className="hidden 2xl:inline">scroll to zoom · drag to pan · click a bar</span>
      <span className="hidden sm:inline">{currentSeries.candles.length} bars</span>
      <span className="hidden sm:inline">{currentSeries.credits.toLocaleString()} cr</span>
      {zoom.zoomed && <button type="button" onClick={zoom.reset} className="btn">reset zoom</button>}
      {modeSelect}
    </>
  ) : modeSelect;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:h-screen lg:min-h-[640px]">
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 whitespace-nowrap border-b border-border px-4 py-2 lg:h-12 lg:flex-nowrap lg:py-0">
        <span className="font-display text-base">Candle Lab</span>
        <label className="flex items-center gap-2">
          <span className="eyebrow">coin</span>
          <select value={coin} onChange={(e) => { setCoin(e.target.value); setAnchor(Date.now()); setSelectedT(null); setFollowLive(false); }} className="h-7 rounded-sm border border-border bg-background px-2 font-mono text-xs">
            {COINS.map((symbol) => <option key={symbol}>{symbol}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span className="eyebrow">interval</span>
          <span className="seg">
            {(Object.keys(INTERVALS) as Interval[]).map((choice) => (
              <button key={choice} type="button" onClick={() => { setInterval(choice); setAnchor(Date.now()); setSelectedT(null); setFollowLive(false); }} className={interval === choice ? "on" : ""}>{choice}</button>
            ))}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button type="button" onClick={toggleAppearance} className="btn grid h-7 w-7 place-items-center p-0" title={appearance === "dark" ? "switch to light" : "switch to dark"} aria-label="toggle appearance">
            {appearance === "dark" ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            )}
          </button>
        </div>
      </header>

      {ready && (
        <main className="grid grid-cols-1 gap-3 p-3 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-[minmax(16rem,1fr)_auto]">
          <div className="h-[26rem] sm:h-[24rem] lg:col-span-8 lg:h-auto lg:min-h-0">
          <Panel title="chart" padded={false} meta={chartMeta}>
            <div className="h-full p-2">
              {!currentSeries ? (
                <ChartSkeleton />
              ) : currentSeries.error ? (
                <div className="flex h-full items-center justify-center text-sm text-down">{currentSeries.error}</div>
              ) : (
                <CandleChart candles={currentSeries.candles} selectedT={selected} onSelect={selectBar} dark={appearance === "dark"} onZoomState={onZoomState} />
              )}
            </div>
          </Panel>
          </div>

          <div className="h-[27rem] lg:col-span-4 lg:h-auto lg:min-h-0">
            {selected !== null && currentDetail && !currentDetail.error && (fills.length || liveBar) ? (
              <Builder coin={coin} interval={interval} barT={selected} fills={fills} replay={replay} official={officialBar} live={liveBar} />
            ) : currentDetail?.error ? (
              <Panel title="building"><div className="flex h-full items-center justify-center text-sm text-down">{currentDetail.error}</div></Panel>
            ) : (
              <BuilderSkeleton live={liveBar} />
            )}
          </div>

          <div className="lg:col-span-8 lg:min-h-0">
            {selected !== null && currentDetail && !currentDetail.error ? (
              <Steps coin={coin} interval={interval} barT={selected} fills={fills} revealedCount={replay.index} official={officialBar}
                candleSql={fillsCandleQuery(coin, interval, window_.start, window_.end)} fillsSql={fillsForBarQuery(coin, interval, selected)}
                active={step} onChange={setStep} replay={replay} tour={tour} onTour={toggleTour} />
            ) : <StepsSkeleton />}
          </div>

          <div className="h-[20rem] lg:col-span-4 lg:h-auto lg:min-h-0">
            {currentDetail && !currentDetail.error ? <Tape fills={fills.slice(0, replay.index)} live={liveBar} /> : <TapeSkeleton live={liveBar} />}
          </div>
        </main>
      )}

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-1.5 font-mono text-[11px] text-muted-foreground lg:h-8 lg:flex-nowrap lg:whitespace-nowrap lg:py-0">
        <span>
          Powered by{" "}
          <a href="https://www.quicknode.com/sql-explorer" target="_blank" rel="noreferrer" className="text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">Quicknode SQL Explorer</a>
          {" "}· venue candles via{" "}
          <a href="https://www.quicknode.com/docs/hyperliquid" target="_blank" rel="noreferrer" className="text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">Quicknode HyperCore</a>
        </span>
        <span>{creditsUsed.toLocaleString()} credits this session</span>
      </footer>
    </div>
  );
}
