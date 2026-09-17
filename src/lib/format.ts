import { INTERVALS, type Interval } from "@/lib/candles";

export function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "–";
  const digits = value >= 1000 ? 1 : value >= 10 ? 3 : value >= 1 ? 4 : 6;
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function formatUsd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatNum(value: number, digits = 2): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** "18:45:00.059" in UTC. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
}

/** "2026-09-15 18:45 UTC · 1m bar" */
export function formatBar(ms: number, interval: Interval): string {
  const d = new Date(ms);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const seconds = INTERVALS[interval].seconds < 60 ? `:${pad(d.getUTCSeconds())}` : "";
  const time = INTERVALS[interval].seconds >= 86400 ? "" : ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds}`;
  return `${date}${time} UTC`;
}
