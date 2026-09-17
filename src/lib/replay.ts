"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ReplayControls {
  /** Number of fills revealed so far. */
  index: number;
  /** 0..1 position through the bar. */
  progress: number;
  playing: boolean;
  speed: number;
  done: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  seek: (fraction: number) => void;
  setSpeed: (speed: number) => void;
}

interface Options {
  barStart: number;
  barSpan: number;
  /** Wall-clock length of one full replay at 1x. Pass the bar span for real time. */
  durationMs: number;
  /** Starting speed multiplier. */
  initialSpeed?: number;
  loop: boolean;
  /** Pause at the end before looping. */
  holdMs: number;
  /** The bar is still forming: show every fill as it arrives, no playback. */
  live?: boolean;
}

/**
 * Plays a bar's fills back in compressed time. Fill times keep their real
 * spacing, so blocks land in bursts the way they did on chain.
 */
export function useReplay(fillTimes: number[], options: Options): ReplayControls {
  const { barStart, barSpan, durationMs, loop, holdMs, live = false, initialSpeed = 1 } = options;
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const [progress, setProgress] = useState(reduced ? 1 : 0);
  const [playing, setPlaying] = useState(!reduced);
  const [speed, setSpeed] = useState(initialSpeed);
  const frame = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const holdUntil = useRef<number | null>(null);

  // A new bar restarts the replay from the top.
  const fillKey = `${barStart}:${fillTimes.length}`;
  useEffect(() => {
    if (reduced || live) return;
    const frameId = requestAnimationFrame(() => { setProgress(0); setPlaying(true); setSpeed(initialSpeed); holdUntil.current = null; });
    return () => cancelAnimationFrame(frameId);
  }, [fillKey, reduced, live, initialSpeed]);

  useEffect(() => {
    if (!playing || live) { last.current = null; return; }
    const tick = (now: number) => {
      if (last.current === null) last.current = now;
      const delta = now - last.current;
      last.current = now;
      if (holdUntil.current !== null) {
        if (now >= holdUntil.current) { holdUntil.current = null; setProgress(0); }
      } else {
        setProgress((current) => {
          const next = current + (delta / durationMs) * speed;
          if (next >= 1) {
            if (loop) holdUntil.current = now + holdMs;
            else setPlaying(false);
            return 1;
          }
          return next;
        });
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [playing, speed, durationMs, loop, holdMs, live]);

  const index = useMemo(() => {
    if (live) return fillTimes.length;
    const cutoff = barStart + progress * barSpan;
    let count = 0;
    for (const t of fillTimes) { if (t <= cutoff) count += 1; else break; }
    return progress >= 1 ? fillTimes.length : count;
  }, [fillTimes, barStart, barSpan, progress, live]);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((current) => !current), []);
  const restart = useCallback(() => { holdUntil.current = null; setProgress(0); setPlaying(true); }, []);
  const seek = useCallback((fraction: number) => { holdUntil.current = null; setProgress(Math.min(1, Math.max(0, fraction))); }, []);

  return { index, progress: live ? 1 : progress, playing: live ? false : playing, speed, done: live || progress >= 1, play, pause, toggle, restart, seek, setSpeed };
}
