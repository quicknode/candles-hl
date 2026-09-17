"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { Candle, Interval } from "@/lib/candles";
import { INTERVALS } from "@/lib/candles";
import { buildCandle, type Fill } from "@/lib/anatomy";
import { curlForQuery } from "@/lib/sql";
import Panel from "@/components/Panel";
import type { ReplayControls } from "@/lib/replay";
import { formatClock, formatNum, formatPrice, formatUsd } from "@/lib/format";

export const STEP_IDS = ["blocks", "ordering", "liquidations", "volume", "venue", "sql"] as const;
export type StepId = (typeof STEP_IDS)[number];

const TABS: Record<StepId, string> = {
  blocks: "Blocks", ordering: "Ordering", liquidations: "Liquidations", volume: "Volume", venue: "Venue check", sql: "SQL",
};

const TITLES: Record<StepId, string> = {
  blocks: "Fills arrive in blocks",
  ordering: "Open and close are about order",
  liquidations: "High and low skip liquidations",
  volume: "Volume keeps everything",
  venue: "Check it against the venue",
  sql: "Extract it yourself",
};

interface Props {
  coin: string;
  interval: Interval;
  barT: number;
  fills: Fill[];
  revealedCount: number;
  official: Candle | null;
  candleSql: string;
  fillsSql: string;
  active: StepId;
  onChange: (id: StepId) => void;
  replay: ReplayControls;
  tour: boolean;
  onTour: () => void;
}

const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

/** Prose on the left in a narrow measure, the interactive part on the right. */
function Split({ text, children }: { text: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,17rem)_1fr]">
      <div className="space-y-3 text-sm leading-6 text-muted-foreground [&_b]:text-foreground [&_code]:text-foreground">{text}</div>
      <div className="min-w-0 space-y-3">{children}</div>
    </div>
  );
}

function FillRows({ fills, tag }: { fills: Fill[]; tag: (fill: Fill) => string | null }) {
  return (
    <LayoutGroup>
      <ul className="overflow-hidden rounded-md border border-border bg-background/40 font-mono text-xs">
        <li className="grid grid-cols-[5.5rem_1fr_1fr_4rem_5rem_4rem_4rem] gap-x-3 border-b border-border px-3 py-1 text-muted-foreground">
          <span>time</span><span>aggressor oid</span><span>trade id</span><span>side</span><span className="text-right">price</span><span className="text-right">size</span><span />
        </li>
        <AnimatePresence initial={false}>
          {fills.map((fill) => {
            const label = tag(fill);
            return (
              <motion.li key={fill.tid} layout transition={spring}
                className={`grid grid-cols-[5.5rem_1fr_1fr_4rem_5rem_4rem_4rem] gap-x-3 border-t border-border/60 px-3 py-1 ${label ? "bg-accent/50 text-accent-foreground" : ""}`}>
                <span className="text-muted-foreground">{formatClock(fill.t)}</span>
                <span className="truncate">{fill.aggressorOid}</span>
                <span className="truncate text-muted-foreground">{fill.tid}</span>
                <span>{fill.aggressor === "B" ? "buy" : "sell"}</span>
                <span className="text-right">{formatPrice(fill.px)}</span>
                <span className="text-right">{formatNum(fill.sz, 3)}</span>
                <span className="text-right">{label}</span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </LayoutGroup>
  );
}

function Blocks({ fills, revealedCount, barT, interval, replay }: { fills: Fill[]; revealedCount: number; barT: number; interval: Interval; replay: ReplayControls }) {
  const span = INTERVALS[interval].seconds * 1000;
  const blocks = useMemo(() => {
    const byBlock = new Map<number, { t: number; n: number; buy: number; liq: number; firstIndex: number }>();
    fills.forEach((fill, index) => {
      const entry = byBlock.get(fill.block) ?? { t: fill.t, n: 0, buy: 0, liq: 0, firstIndex: index };
      entry.n += 1; if (fill.aggressor === "B") entry.buy += 1; if (fill.liq) entry.liq += 1;
      byBlock.set(fill.block, entry);
    });
    return [...byBlock.values()];
  }, [fills]);
  const max = Math.max(1, ...blocks.map((block) => block.n));
  // Inset the drawing so the first and last blocks sit clear of the border.
  const INSET = 14, BAR = 2.8;
  const xFor = (t: number) => INSET + ((t - barT) / span) * (1000 - INSET * 2 - BAR);
  const cursorX = (fills.length && revealedCount ? xFor(fills[Math.min(revealedCount, fills.length) - 1].t) : INSET) + BAR / 2;
  const liqBlocks = blocks.filter((block) => block.liq > 0).length;
  const scrub = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.buttons !== 1 && event.type !== "pointerdown") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const inset = (14 / 1000) * rect.width;
    replay.pause();
    replay.seek((event.clientX - rect.left - inset) / (rect.width - inset * 2));
  };
  return (
    <div className="flex h-full flex-col gap-2">
      <p>No continuous tape: orders match inside blocks every 100 to 200 ms, and every fill in a block shares one timestamp. This bar: <b className="font-normal text-foreground">{fills.length.toLocaleString()} fills</b> in <b className="font-normal text-foreground">{blocks.length.toLocaleString()} blocks</b>.</p>
      <svg viewBox="0 0 1000 90" className="min-h-28 w-full flex-1 cursor-ew-resize touch-none rounded-md border border-border bg-background/40" preserveAspectRatio="none"
        onPointerDown={scrub} onPointerMove={scrub}>
        {blocks.map((block) => {
          const x = xFor(block.t);
          const h = Math.sqrt(block.n / max) * 78;
          const revealed = block.firstIndex < revealedCount;
          return <rect key={block.t + ":" + block.firstIndex} x={x} y={86 - h} width={BAR} height={h}
            fill={block.liq ? "var(--down)" : block.buy * 2 >= block.n ? "var(--up)" : "var(--muted-foreground)"} opacity={revealed ? 0.95 : 0.18} />;
        })}
        <motion.line y1={0} y2={90} initial={false} animate={{ x1: cursorX, x2: cursorX }} transition={{ duration: 0.12 }} stroke="var(--foreground)" strokeWidth={1} strokeDasharray="2 3" />
      </svg>
      <p className="text-sm text-muted-foreground">One line per block, height is fills. Green: buyers aggressed. Red: carried a liquidation{liqBlocks ? ` (${liqBlocks} of ${blocks.length} blocks here)` : " (none in this bar)"}. Drag to scrub; play in the builder resumes.</p>
    </div>
  );
}

/** The last block whose close differs between the two orderings, so the toggle shows the effect. Falls back to the final block. */
function pickOrderingBlock(fills: Fill[]): { block: Fill[]; isFinal: boolean } {
  if (!fills.length) return { block: [], isFinal: true };
  const byBlock = new Map<number, Fill[]>();
  for (const fill of fills) {
    const list = byBlock.get(fill.block);
    if (list) list.push(fill); else byBlock.set(fill.block, [fill]);
  }
  const blocks = [...byBlock.values()];
  const lastClose = (list: Fill[]) => [...list].reverse().find((fill) => !fill.liq)?.px;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const list = blocks[index];
    if (list.length > 1 && lastClose(list) !== lastClose([...list].sort((a, b) => a.tid - b.tid))) {
      return { block: list, isFinal: index === blocks.length - 1 };
    }
  }
  return { block: blocks[blocks.length - 1], isFinal: true };
}

const CYCLE_MS = 4000;

/** Alternates between two states on a timer until someone picks one; "auto" hands control back to the timer. */
function useCycle() {
  const [on, setOn] = useState(false);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => setOn((current) => !current), CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [auto]);
  const pick = (value: boolean) => { setAuto(false); setOn(value); };
  const resume = () => setAuto(true);
  return { on, auto, pick, resume };
}

function Toggle({ options, value, auto, onPick, onResume }: { options: [string, boolean][]; value: boolean; auto: boolean; onPick: (value: boolean) => void; onResume: () => void }) {
  return (
    <span className="flex items-center gap-2">
      <span className="seg">{options.map(([label, option]) => (
        <button key={label} type="button" onClick={() => onPick(option)} className={value === option ? "on" : ""}>{label}</button>
      ))}</span>
      {!auto && <button type="button" onClick={onResume} className="btn">auto</button>}
    </span>
  );
}

function Ordering({ fills }: { fills: Fill[] }) {
  const cycle = useCycle();
  const byTid = cycle.on;
  const picked = useMemo(() => pickOrderingBlock(fills), [fills]);
  const lastBlock = picked.block;
  const isFinal = picked.isFinal;
  const ordered = useMemo(() => byTid ? [...lastBlock].sort((a, b) => a.tid - b.tid) : lastBlock, [lastBlock, byTid]);
  const shown = ordered.slice(-4);
  const hidden = ordered.length - shown.length;
  const closeFill = [...ordered].reverse().find((fill) => !fill.liq);
  const trueClose = [...lastBlock].reverse().find((fill) => !fill.liq);
  const differs = closeFill && trueClose && closeFill.px !== trueClose.px;
  return (
    <Split text={<>
      <p>Trade ids are not sequential, so &ldquo;last trade by id&rdquo; is a random fill. Order ids are.</p>
      <p>Sort by <code>(block, aggressor oid, price along the sweep)</code> and the last row is the real close.</p>
      <motion.p key={String(byTid)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
        {byTid
          ? differs ? <>By trade id: <code>{formatPrice(closeFill!.px)}</code>. Actual close: <code>{formatPrice(trueClose!.px)}</code>.</> : <>Both orders agree here. Across a day of 1m bars they disagree on 10 to 15%.</>
          : <>Highlighted: the block&rsquo;s true last fill{isFinal ? ", the bar's close" : ""}.</>}
      </motion.p>
    </>}>
      <div className="flex min-w-0 items-center gap-2 whitespace-nowrap font-mono text-xs">
        <span className="truncate text-muted-foreground" title={isFinal ? "the bar's last block" : "the last block in this bar where the two orderings disagree"}>{isFinal ? "last block" : "disagreeing block"} · {lastBlock.length} fills{hidden > 0 ? ` · last ${shown.length} shown` : ""}</span>
        <span className="ml-auto shrink-0"><Toggle options={[["execution order", false], ["trade id", true]]} value={byTid} auto={cycle.auto} onPick={cycle.pick} onResume={cycle.resume} /></span>
      </div>
      <FillRows fills={shown} tag={(fill) => (fill.tid === closeFill?.tid ? "close" : null)} />
    </Split>
  );
}

function Liquidations({ fills }: { fills: Fill[] }) {
  const cycle = useCycle();
  const include = cycle.on;
  const built = useMemo(() => buildCandle(fills), [fills]);
  const liq = fills.filter((fill) => fill.liq);
  const low = include ? built.lWithLiq : built.l;
  const high = include ? built.hWithLiq : built.h;
  const top = built.hWithLiq ?? 1, bottom = built.lWithLiq ?? 0, range = Math.max(top - bottom, Number.EPSILON);
  const y = (px: number) => 16 + ((top - px) / range) * 128;
  const up = (built.c ?? 0) >= (built.o ?? 0);
  return (
    <Split text={<>
      {liq.length ? (
        <p><b>{liq.length.toLocaleString()} fills</b> so far were liquidations, {formatUsd(built.liqUsd)}. The venue drops them from open, high, low, and close but keeps them in volume and count.</p>
      ) : (
        <p>No liquidations so far. Load the cascade example from the chart header to watch one move the low by 12 ticks.</p>
      )}
      {liq.length > 0 && <p>Lowest liquidation fill {formatPrice(Math.min(...liq.map((fill) => fill.px)))}, mark price {formatPrice(liq.reduce((m, f) => (f.px < m.px ? f : m)).liqMarkPx)}.</p>}
    </>}>
      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <svg viewBox="0 0 220 160" className="h-32 w-full rounded-md border border-border bg-background/40">
          {built.o !== null && built.c !== null && high !== null && low !== null && (
            <>
              <motion.line x1={60} x2={60} initial={false} animate={{ y1: y(high), y2: y(low) }} transition={spring} stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={3} />
              <rect x={44} width={32} y={y(Math.max(built.o, built.c))} height={Math.max(2, y(Math.min(built.o, built.c)) - y(Math.max(built.o, built.c)))} fill={up ? "var(--up)" : "var(--down)"} />
              <motion.g initial={false} animate={{ y: y(high) }} transition={spring} fontFamily="var(--font-mono)" fontSize={10}>
                <line x1={80} x2={98} y1={0} y2={0} stroke="var(--border)" /><text x={104} y={3.5} fill="var(--muted-foreground)">high</text><text x={212} y={3.5} textAnchor="end" fill="currentColor">{formatPrice(high)}</text>
              </motion.g>
              <motion.g initial={false} animate={{ y: y(low) }} transition={spring} fontFamily="var(--font-mono)" fontSize={10}>
                <line x1={80} x2={98} y1={0} y2={0} stroke="var(--border)" /><text x={104} y={3.5} fill="var(--muted-foreground)">low</text><text x={212} y={3.5} textAnchor="end" fill="currentColor">{formatPrice(low)}</text>
              </motion.g>
            </>
          )}
        </svg>
        <div className="space-y-3">
          <div className="font-mono text-xs"><Toggle options={[["liquidations excluded", false], ["included", true]]} value={include} auto={cycle.auto} onPick={cycle.pick} onResume={cycle.resume} /></div>
          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="rounded-md border border-border bg-background/40 p-3"><div className="text-muted-foreground">low</div><div className="text-lg">{formatPrice(low)}</div></div>
            <div className="rounded-md border border-border bg-background/40 p-3"><div className="text-muted-foreground">venue low</div><div className="text-lg">{formatPrice(built.l)}</div></div>
          </div>
        </div>
      </div>
    </Split>
  );
}

function Volume({ fills }: { fills: Fill[] }) {
  const built = useMemo(() => buildCandle(fills), [fills]);
  const buy = fills.filter((fill) => fill.aggressor === "B").reduce((sum, fill) => sum + fill.px * fill.sz, 0);
  const share = built.usd ? (buy / built.usd) * 100 : 0;
  return (
    <Split text={<>
      <p>The liquidation fills dropped from price still count here.</p>
      <p>The same query also returns what venue candles never carry: who aggressed, and how much volume was forced.</p>
    </>}>
      <div className="grid grid-cols-2 gap-3 font-mono text-xs">
        {[["base volume", formatNum(built.v, 2)], ["notional", formatUsd(built.usd)], ["trades", built.n.toLocaleString()], ["liquidated", formatUsd(built.liqUsd)]].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-background/40 p-3"><div className="text-muted-foreground">{label}</div><div className="mt-1 text-lg">{value}</div></div>
        ))}
      </div>
      <div>
        <div className="flex justify-between font-mono text-xs text-muted-foreground"><span>taker buys {share.toFixed(1)}%</span><span>taker sells {(100 - share).toFixed(1)}%</span></div>
        <div className="mt-1 flex h-2 overflow-hidden rounded-sm bg-muted">
          <motion.div initial={{ width: 0 }} animate={{ width: `${share}%` }} transition={{ duration: 0.8, ease: "easeOut" }} className="bg-up" />
          <div className="flex-1 bg-down/70" />
        </div>
      </div>
    </Split>
  );
}

function Venue({ fills, official }: { fills: Fill[]; official: Candle | null }) {
  const built = useMemo(() => buildCandle(fills), [fills]);
  const rows: [string, string, string, boolean][] = [
    ["open", formatPrice(built.o), formatPrice(official?.o ?? null), built.o === official?.o],
    ["high", formatPrice(built.h), formatPrice(official?.h ?? null), built.h === official?.h],
    ["low", formatPrice(built.l), formatPrice(official?.l ?? null), built.l === official?.l],
    ["close", formatPrice(built.c), formatPrice(official?.c ?? null), built.c === official?.c],
    ["volume", formatNum(built.v, 2), official ? formatNum(official.v ?? 0, 2) : "–", !!official && Math.abs(built.v - (official.v ?? 0)) < 1e-6],
    ["trades", built.n.toLocaleString(), official ? official.n.toLocaleString() : "–", built.n === official?.n],
  ];
  return (
    <Split text={<>
      <p>Same bar from the venue&rsquo;s <code>candleSnapshot</code>, via the Quicknode HyperCore endpoint.</p>
      <p>Over 8,640 bars on six coins: high, low, volume, count exact; open and close 99.7%.</p>
      {!official && <p>The venue publishes 1m and up, so sub-minute bars have no reference.</p>}
    </>}>
      <div className="overflow-hidden rounded-md border border-border bg-background/40 font-mono text-xs">
        <div className="grid grid-cols-4 border-b border-border px-3 py-1.5 text-muted-foreground"><span>field</span><span className="text-right">from fills</span><span className="text-right">venue</span><span className="text-right" /></div>
        {rows.map(([label, ours, venue, ok], index) => (
          <motion.div key={label} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08 }} className="grid grid-cols-4 border-t border-border/60 px-3 py-1.5">
            <span className="text-muted-foreground">{label}</span><span className="text-right">{ours}</span><span className="text-right">{venue}</span>
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + index * 0.12 }} className={`text-right ${ok ? "text-up" : "text-down"}`}>{official ? (ok ? "match" : "differs") : ""}</motion.span>
          </motion.div>
        ))}
      </div>
    </Split>
  );
}

function Sql({ candleSql, fillsSql }: { candleSql: string; fillsSql: string }) {
  const tabs = [["candles, any interval", candleSql], ["fills for this bar", fillsSql], ["curl", curlForQuery(candleSql)]] as const;
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const lines = tabs[tab][1].split("\n");
  return (
    <Split text={<>
      <p>One table, <code>hyperliquid_fills</code>, via Quicknode SQL Explorer. History from 2025-03-23, every perp.</p>
      <p>Change <code>INTERVAL</code> for 15 s to 1 d. For 1h and up, <code>hyperliquid_market_volume_hourly</code> is about 40x cheaper but keeps liquidations in high and low.</p>
    </>}>
      <div className="rounded-md border border-border bg-background/40">
        <div className="flex items-center justify-between border-b border-border px-3 py-2 font-mono text-xs">
          <div className="flex gap-1">{tabs.map(([label], index) => (
            <button key={label} type="button" onClick={() => setTab(index)} className={`rounded-sm px-2 py-1 ${tab === index ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
          ))}</div>
          <button type="button" onClick={async () => { await navigator.clipboard.writeText(tabs[tab][1]); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="rounded-sm border border-border px-2 py-1 text-muted-foreground hover:text-foreground">{copied ? "copied" : "copy"}</button>
        </div>
        <pre className="max-h-36 overflow-auto p-3 font-mono text-xs leading-5">
          {lines.map((line, index) => (
            <motion.div key={tab + ":" + index} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(index * 0.025, 1) }}>{line || " "}</motion.div>
          ))}
        </pre>
      </div>
    </Split>
  );
}

export default function Steps(props: Props) {
  const { active, onChange, tour, onTour } = props;
  // Every tab follows the replay: it sees only the fills revealed so far, and lands on the full bar at the close.
  const revealed = useMemo(() => props.fills.slice(0, props.revealedCount), [props.fills, props.revealedCount]);
  const activeIndex = STEP_IDS.indexOf(active);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (event.key === "ArrowRight") onChange(STEP_IDS[Math.min(STEP_IDS.length - 1, activeIndex + 1)]);
      if (event.key === "ArrowLeft") onChange(STEP_IDS[Math.max(0, activeIndex - 1)]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, onChange]);

  return (
    <Panel title="how it forms" padded={false} meta={<>
      <span>← → to move</span>
      <button type="button" onClick={onTour} className={`btn ${tour ? "btn-on" : ""}`} title="advance the tabs every 9 seconds">{tour ? "tour on" : "auto tour"}</button>
    </>}>
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STEP_IDS.map((id, index) => (
            <button key={id} type="button" onClick={() => onChange(id)}
              className={`relative flex shrink-0 items-baseline gap-2 px-4 py-1.5 text-sm ${active === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <span className="font-mono text-[11px]">{String(index + 1).padStart(2, "0")}</span>
              <span className="whitespace-nowrap">{TABS[id]}</span>
              {active === id && <motion.span layoutId="step-underline" className="absolute inset-x-3 bottom-0 h-px bg-accent" />}
            </button>
          ))}
        </div>
        {/* All six panels share one grid cell, so the row is always as tall as the tallest tab and nothing above it shifts when you switch. */}
        {/* Fixed height so the row never moves as fills arrive or bars change; every tab is sized to fit inside it. */}
        <div className="grid min-h-[18rem] p-4 text-sm leading-6 lg:h-[18rem]">
          {STEP_IDS.map((id) => {
            const isActive = active === id;
            return (
              <motion.div key={id} initial={false} animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 6 }} transition={{ duration: 0.2 }}
                aria-hidden={!isActive} className={`col-start-1 row-start-1 flex min-h-0 flex-col overflow-hidden ${isActive ? "" : "pointer-events-none invisible"}`}>
                <h2 className="mb-2 shrink-0 font-display text-lg">{TITLES[id]}</h2>
                {id === "blocks" && <Blocks fills={props.fills} revealedCount={props.revealedCount} barT={props.barT} interval={props.interval} replay={props.replay} />}
                {id === "ordering" && <Ordering fills={revealed} />}
                {id === "liquidations" && <Liquidations fills={revealed} />}
                {id === "volume" && <Volume fills={revealed} />}
                {id === "venue" && <Venue fills={revealed} official={props.official} />}
                {id === "sql" && <Sql candleSql={props.candleSql} fillsSql={props.fillsSql} />}
              </motion.div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
