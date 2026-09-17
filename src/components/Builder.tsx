"use client";

import { useEffect, useMemo } from "react";
import { animate, motion, useMotionValue, useTransform, AnimatePresence } from "motion/react";
import type { Candle, Interval } from "@/lib/candles";
import { INTERVALS, REPLAY_SPEEDS } from "@/lib/candles";
import { buildCandle, type Fill } from "@/lib/anatomy";
import type { ReplayControls } from "@/lib/replay";
import Panel from "@/components/Panel";
import { useSize } from "@/lib/useSize";
import { formatBar, formatClock, formatNum, formatPrice, formatUsd } from "@/lib/format";

interface Props {
  coin: string;
  interval: Interval;
  barT: number;
  fills: Fill[];
  replay: ReplayControls;
  official: Candle | null;
  live: boolean;
}

function Counter({ value, format }: { value: number; format: (n: number) => string }) {
  const motionValue = useMotionValue(value);
  const text = useTransform(motionValue, (latest) => format(latest));
  useEffect(() => { const controls = animate(motionValue, value, { duration: 0.35, ease: "easeOut" }); return controls.stop; }, [value, motionValue]);
  return <motion.span>{text}</motion.span>;
}

const spring = { type: "spring", stiffness: 260, damping: 28 } as const;
const settle = { type: "tween", duration: 0.28, ease: "easeOut" } as const;
const LABEL = 14;
const PAD = 24;

export default function Builder({ coin, interval, barT, fills, replay, official, live }: Props) {
  const { ref: stageRef, size } = useSize<HTMLDivElement>();
  const revealed = useMemo(() => fills.slice(0, replay.index), [fills, replay.index]);
  const built = useMemo(() => buildCandle(revealed), [revealed]);
  const lastFill = revealed[revealed.length - 1];
  const span = INTERVALS[interval].seconds * 1000;

  const W = Math.max(size.width, 1), H = Math.max(size.height, 1);
  const bodyWidth = Math.min(48, Math.max(30, W * 0.12));
  const cx = Math.round(W * 0.27);
  // Fixed scale to the finished bar, so the candle grows into the faint outline of where it will end.
  const full = useMemo(() => buildCandle(fills), [fills]);
  const top = full.hWithLiq ?? 1, bottom = full.lWithLiq ?? 0;
  const range = Math.max(top - bottom, Number.EPSILON);
  const y = (px: number) => PAD + ((top - px) / range) * (H - PAD * 2);
  const up = (built.c ?? 0) >= (built.o ?? 0);
  const color = up ? "var(--up)" : "var(--down)";
  const has = built.o !== null && built.h !== null && built.l !== null && built.c !== null;
  const bodyTop = has ? y(Math.max(built.o!, built.c!)) : y(top);
  const bodyBottom = has ? y(Math.min(built.o!, built.c!)) : y(top);

  const seekToPrice = (px: number, pick: "first" | "last") => {
    const priced = fills.filter((fill) => !fill.liq);
    const list = pick === "first" ? priced : [...priced].reverse();
    const fill = list.find((f) => f.px === px);
    if (fill) { replay.pause(); replay.seek(Math.min(1, (fill.t - barT + 1) / span)); }
  };
  const stepBlock = (direction: 1 | -1) => {
    if (!fills.length) return;
    replay.pause();
    const currentBlock = lastFill?.block ?? -Infinity;
    const target = direction === 1 ? fills.find((fill) => fill.block > currentBlock) : [...fills].reverse().find((fill) => fill.block < currentBlock);
    if (!target) { replay.seek(direction === 1 ? 1 : 0); return; }
    const blockEnd = [...fills].reverse().find((fill) => fill.block === target.block)!;
    replay.seek(Math.min(1, (blockEnd.t - barT + 1) / span));
  };

  const finished = replay.done;
  const venueChecks = official ? [
    ["O", built.o === official.o, built.o, "first"], ["H", built.h === official.h, built.h, "first"], ["L", built.l === official.l, built.l, "first"],
    ["C", built.c === official.c, built.c, "last"], ["V", Math.abs(built.v - (official.v ?? 0)) < 1e-6, null, "first"], ["N", built.n === official.n, null, "first"],
  ] as const : [];

  // Keyed by slot (high, upper body edge, lower body edge, low) so open and close never cross when a candle flips direction.
  const labels: [string, string, number, "first" | "last"][] = has ? [
    ["high", "high", built.h!, "first"],
    ["upper", up ? "close" : "open", up ? built.c! : built.o!, up ? "last" : "first"],
    ["lower", up ? "open" : "close", up ? built.o! : built.c!, up ? "first" : "last"],
    ["low", "low", built.l!, "first"],
  ] : [];
  // Stack labels downward without overlap, then keep the whole stack inside the stage.
  const gap = LABEL + 6;
  const placed: number[] = [];
  for (const [, , px] of labels) { const wanted = y(px); const prev = placed.length ? placed[placed.length - 1] + gap : -Infinity; placed.push(Math.max(wanted, prev)); }
  if (placed.length) {
    const bottomLimit = H - LABEL;
    const overshoot = placed[placed.length - 1] - bottomLimit;
    if (overshoot > 0) for (let i = 0; i < placed.length; i += 1) placed[i] -= overshoot;
    const topLimit = LABEL;
    if (placed[0] < topLimit) { const lift = topLimit - placed[0]; for (let i = 0; i < placed.length; i += 1) placed[i] += lift; }
  }

  const speeds = REPLAY_SPEEDS.filter((speed) => speed <= Math.max(1, INTERVALS[interval].seconds / 2));
  const venueRow = (place: "column" | "status") => (
    <div className={`${place === "column" ? "venue-column" : "venue-status"} font-mono text-[11px] leading-4`}>
      <div className={place === "column" ? "mb-0.5 text-muted-foreground" : "hidden"}>venue</div>
      <div className="flex items-center gap-1">
      {venueChecks.map(([label, ok, px, pick]) => (
        <motion.button key={label} type="button" initial={false} onClick={() => px !== null && seekToPrice(px, pick)}
          animate={{ backgroundColor: ok ? "var(--accent)" : finished ? "var(--error)" : "var(--muted)", color: ok || finished ? "var(--accent-foreground)" : "var(--muted-foreground)" }}
          transition={{ duration: 0.3 }} className="rounded-sm px-1 py-0.5" title={px !== null ? `jump to the fill that set the ${label}` : undefined}>
          {label}
        </motion.button>
      ))}
      </div>
      {!official && <div className="mt-1 text-muted-foreground">{INTERVALS[interval].seconds < 60 ? "publishes 1m and up" : live ? "publishes at close" : "no venue bar"}</div>}
    </div>
  );

  return (
    <Panel
      title={live ? "building · live" : "building"}
      padded={false}
      meta={<>
        <span className="font-display text-lg text-foreground">{coin} <span className="text-muted-foreground">{interval}</span></span>
        <span>{formatBar(barT, interval)}</span>
        {live && <span className="flex items-center gap-1 text-up"><span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-up" />live</span>}
      </>}
    >
      <div className="builder-body flex h-full flex-col">
        <div className="stage-grid grid min-h-0 flex-1 grid-cols-[1fr_9rem] gap-3 px-4 pt-2">
        <div ref={stageRef} className="relative min-h-0 overflow-hidden">
          {size.height > 0 && (
            <svg width={W} height={H} className="absolute inset-0" role="img" aria-label="candle forming">
              {!fills.length && (
                <text x={W / 2} y={H / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={LABEL} fill="var(--muted-foreground)">{live ? "waiting for the first fill" : "no fills"}</text>
              )}
              {full.h !== null && full.l !== null && (
                <g opacity={0.14}>
                  <line x1={cx} x2={cx} y1={y(full.h)} y2={y(full.l)} stroke="currentColor" strokeWidth={3} />
                  <rect x={cx - bodyWidth / 2} width={bodyWidth} y={y(Math.max(full.o!, full.c!))} height={Math.max(2, y(Math.min(full.o!, full.c!)) - y(Math.max(full.o!, full.c!)))} fill="currentColor" />
                </g>
              )}
              {has && (
                <>
                  <motion.line x1={cx} x2={cx} initial={false} animate={{ y1: y(built.h!), y2: y(built.l!) }} transition={spring} stroke={color} strokeWidth={3} />
                  <motion.rect x={cx - bodyWidth / 2} width={bodyWidth} rx={2} initial={false} animate={{ y: bodyTop, height: Math.max(3, bodyBottom - bodyTop), fill: up ? "#2f9e5f" : "#d64545" }} transition={settle} />
                  {built.lWithLiq !== null && built.l !== null && built.lWithLiq < built.l && (
                    <motion.line x1={cx} x2={cx} initial={false} animate={{ y1: y(built.l), y2: y(built.lWithLiq) }} stroke="var(--down)" strokeWidth={3} strokeDasharray="4 4" opacity={0.6} />
                  )}
                  {labels.map(([slot, label, px, pick], index) => (
                    <motion.g key={slot} initial={false} animate={{ y: placed[index] }} transition={settle} fontFamily="var(--font-mono)" fontSize={LABEL}
                      className="cursor-pointer" onClick={() => seekToPrice(px, pick)}>
                      <line x1={cx + bodyWidth / 2 + 10} x2={cx + bodyWidth / 2 + 30} y1={0} y2={0} stroke="var(--border)" />
                      <text x={cx + bodyWidth / 2 + 38} y={LABEL / 3} fill="var(--muted-foreground)">{label}</text>
                      <text x={Math.min(cx + bodyWidth / 2 + 38 + LABEL * 0.62 * 5 + 8, W - 6 - formatPrice(px).length * (LABEL + 3) * 0.62)} y={LABEL / 3} fill="currentColor" fontSize={LABEL + 3}>{formatPrice(px)}</text>
                      <rect x={cx + bodyWidth / 2 + 8} y={-LABEL} width={W - cx - bodyWidth / 2 - 16} height={LABEL * 2} fill="transparent" />
                    </motion.g>
                  ))}
                </>
              )}
              <AnimatePresence>
                {lastFill && (!finished || live) && (
                  <motion.circle key={lastFill.tid} cx={cx} cy={y(lastFill.px)} fill={lastFill.liq ? "var(--down)" : color}
                    initial={{ opacity: 0.9, r: 4 }} animate={{ opacity: 0, r: 22 }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: "easeOut" }} />
                )}
              </AnimatePresence>
            </svg>
          )}
        </div>

          <div className="stats-col flex min-h-0 flex-col justify-center gap-2 overflow-hidden pr-1">
          <dl className="flex flex-col gap-1 font-mono">
            {([
              ["fills", "fills", <Counter key="n" value={built.n} format={(n) => Math.round(n).toLocaleString()} />],
              ["blocks", "blk", <Counter key="b" value={built.blocks} format={(n) => Math.round(n).toLocaleString()} />],
              ["volume", "vol", <Counter key="v" value={built.v} format={(n) => formatNum(n, 1)} />],
              ["notional", "usd", <Counter key="u" value={built.usd} format={formatUsd} />],
              ["liquidations", "liq", <Counter key="l" value={built.liqN} format={(n) => Math.round(n).toLocaleString()} />],
            ] as const).map(([label, unit, node]) => (
              <div key={label} className="min-w-0 leading-none"><dt className="text-[10px] leading-[14px] text-muted-foreground">{label}</dt><dd className="text-[13px] leading-4" data-unit={unit}>{node}</dd></div>
            ))}
          </dl>
          {venueRow("column")}
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-2">
          {live ? (
            <div className="flex items-center justify-between gap-3 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
              {venueRow("status")}
              <span>{fills.length.toLocaleString()} fills so far · about 3 s behind the chain</span>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={replay.toggle} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-background" aria-label={replay.playing ? "pause" : "play"}>
                  {replay.playing ? <span className="block h-3 w-2.5 border-x-2 border-current" /> : <span className="ml-0.5 block border-y-[6px] border-l-[9px] border-y-transparent border-l-current" />}
                </button>
                <div className="seg"><button type="button" onClick={() => stepBlock(-1)} title="previous block">‹ block</button><button type="button" onClick={() => stepBlock(1)} title="next block">block ›</button></div>
                <input type="range" min={0} max={1000} value={Math.round(replay.progress * 1000)} onChange={(e) => { replay.pause(); replay.seek(Number(e.target.value) / 1000); }} className="min-w-0 flex-1 accent-[var(--accent)]" aria-label="scrub" />
                <div className="seg" title="1x is real time">{speeds.map((speed) => (
                  <button key={speed} type="button" onClick={() => replay.setSpeed(speed)} className={replay.speed === speed ? "on" : ""}>{speed}x</button>
                ))}</div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                {venueRow("status")}
                <span>{lastFill ? formatClock(lastFill.t) : formatClock(barT)} · {revealed.length.toLocaleString()} / {fills.length.toLocaleString()} fills · {replay.speed}x real time</span>
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
