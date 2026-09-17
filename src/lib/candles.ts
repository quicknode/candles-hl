export const INTERVALS = {
  "15s": { seconds: 15, clickhouse: "15 SECOND" },
  "30s": { seconds: 30, clickhouse: "30 SECOND" },
  "1m": { seconds: 60, clickhouse: "1 MINUTE" },
  "5m": { seconds: 300, clickhouse: "5 MINUTE" },
  "15m": { seconds: 900, clickhouse: "15 MINUTE" },
  "1h": { seconds: 3600, clickhouse: "1 HOUR" },
  "4h": { seconds: 14400, clickhouse: "4 HOUR" },
  "1d": { seconds: 86400, clickhouse: "1 DAY" },
} as const;

export type Interval = keyof typeof INTERVALS;
export type Source = "fills" | "hourly";

export const MAX_BARS = 1000;
export const DEFAULT_BARS = 300;

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Base-asset volume. Null when the source only carries notional. */
  v: number | null;
  /** Notional volume in USD. */
  usd: number;
  n: number;
  /** Taker-buy notional. Fills source only. */
  buyUsd: number | null;
  /** Taker-sell notional. Fills source only. */
  sellUsd: number | null;
  /** Notional traded in liquidation fills. Fills source only. */
  liqUsd: number | null;
  /** Count of liquidation fills. Fills source only. */
  liqN: number | null;
}

export function isInterval(value: string): value is Interval {
  return value in INTERVALS;
}

export function hourlySourceAllowed(interval: Interval): boolean {
  return INTERVALS[interval].seconds >= 3600;
}

/** The venue publishes candles from 1m up; sub-minute bars can only be built from fills. */
export function venuePublishes(interval: Interval): boolean {
  return INTERVALS[interval].seconds >= 60;
}

/** Replay speeds are multiples of real time. Default aims for about a minute of playback. */
export const REPLAY_SPEEDS = [1, 2, 5, 10, 30, 60, 240, 1440] as const;
export function defaultReplaySpeed(interval: Interval): number {
  const target = INTERVALS[interval].seconds / 60;
  return REPLAY_SPEEDS.reduce((best, speed) => (Math.abs(speed - target) < Math.abs(best - target) ? speed : best), REPLAY_SPEEDS[0]);
}

const COIN_PATTERN = /^[A-Za-z0-9:@_.\-\/]{1,32}$/;

export function assertCoin(coin: string): string {
  if (!COIN_PATTERN.test(coin)) throw new Error(`Invalid coin: ${coin}`);
  return coin;
}

export function windowFor(interval: Interval, bars: number, now = Date.now()) {
  const step = INTERVALS[interval].seconds * 1000;
  const currentBarStart = Math.floor(now / step) * step;
  const end = currentBarStart + step;
  const start = end - bars * step;
  return { start, end };
}

export function toClickhouseTime(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Exact candles from individual fills.
 *
 * Two rules make these match the venue's own candles:
 *  1. Fills inside a block are ordered by the aggressor's order id and then by
 *     price level in the sweep direction. Trade ids are not monotonic, so
 *     sorting by tid picks a random fill as the open or close.
 *  2. Liquidation fills are excluded from open/high/low/close but kept in
 *     volume and trade count, which is what Hyperliquid does.
 */
export function fillsCandleQuery(coin: string, interval: Interval, startMs: number, endMs: number): string {
  const bucket = INTERVALS[interval].clickhouse;
  return `
SELECT
  toStartOfInterval(ts, INTERVAL ${bucket}) AS t,
  argMinIf(p, (blk, agg_oid, lvl), liq = 0) AS open,
  maxIf(p, liq = 0)                         AS high,
  minIf(p, liq = 0)                         AS low,
  argMaxIf(p, (blk, agg_oid, lvl), liq = 0) AS close,
  sum(s)                                    AS volume,
  sum(usd)                                  AS notional,
  count()                                   AS trades,
  sumIf(usd, agg_side = 'B')                AS buy_notional,
  sumIf(usd, agg_side = 'A')                AS sell_notional,
  sumIf(usd, liq = 1)                       AS liq_notional,
  countIf(liq = 1)                          AS liquidations
FROM (
  SELECT
    tid,
    any(time)                                        AS ts,
    any(block_number)                                AS blk,
    any(price)                                       AS p,
    any(size)                                        AS s,
    anyIf(oid, crossed = 1)                          AS agg_oid,
    anyIf(if(side = 'B', price, -price), crossed = 1) AS lvl,
    anyIf(side, crossed = 1)                         AS agg_side,
    max(is_liquidation)                              AS liq,
    toFloat64(any(price)) * toFloat64(any(size))     AS usd
  FROM hyperliquid_fills
  WHERE coin = '${assertCoin(coin)}'
    AND block_time >= '${toClickhouseTime(startMs)}'
    AND block_time <  '${toClickhouseTime(endMs)}'
  GROUP BY tid
)
GROUP BY t
ORDER BY t
LIMIT ${MAX_BARS}`.trim();
}

/**
 * Fast candles from the pre-aggregated hourly table. Roughly 40x cheaper in
 * credits than fills over the same range. High and low include liquidation
 * fills, so a small share of bars differ from the venue by a tick or two.
 * Volume here is notional USD only.
 */
export function hourlyCandleQuery(coin: string, interval: Interval, startMs: number, endMs: number): string {
  const bucket = INTERVALS[interval].clickhouse;
  return `
SELECT
  toStartOfInterval(hour, INTERVAL ${bucket}) AS t,
  argMin(open, hour)  AS open,
  max(high)           AS high,
  min(low)            AS low,
  argMax(close, hour) AS close,
  sum(volume)         AS notional,
  sum(trade_count)    AS trades
FROM hyperliquid_market_volume_hourly
WHERE coin = '${assertCoin(coin)}'
  AND hour >= '${toClickhouseTime(startMs)}'
  AND hour <  '${toClickhouseTime(endMs)}'
GROUP BY t
ORDER BY t
LIMIT ${MAX_BARS}`.trim();
}

interface FillsRow {
  t: string; open: string | number; high: string | number; low: string | number; close: string | number;
  volume: string | number; notional: string | number; trades: string | number;
  buy_notional: string | number; sell_notional: string | number; liq_notional: string | number; liquidations: string | number;
}
interface HourlyRow {
  t: string; open: string | number; high: string | number; low: string | number; close: string | number;
  notional: string | number; trades: string | number;
}

const num = (value: string | number) => Number(value);
const utcMs = (clickhouseTime: string) => Date.parse(clickhouseTime.replace(" ", "T") + "Z");

export function rowsToCandles(rows: FillsRow[] | HourlyRow[], source: Source): Candle[] {
  return rows.map((row) => ({
    t: utcMs(row.t),
    o: num(row.open),
    h: num(row.high),
    l: num(row.low),
    c: num(row.close),
    v: source === "fills" ? num((row as FillsRow).volume) : null,
    usd: num(row.notional),
    n: num(row.trades),
    buyUsd: source === "fills" ? num((row as FillsRow).buy_notional) : null,
    sellUsd: source === "fills" ? num((row as FillsRow).sell_notional) : null,
    liqUsd: source === "fills" ? num((row as FillsRow).liq_notional) : null,
    liqN: source === "fills" ? num((row as FillsRow).liquidations) : null,
  }));
}

/** Merge a tail refresh into an existing series: bars with the same open time are replaced, newer ones appended. */
export function mergeCandles(existing: Candle[], incoming: Candle[]): Candle[] {
  if (!incoming.length) return existing;
  const firstIncoming = incoming[0].t;
  return existing.filter((bar) => bar.t < firstIncoming).concat(incoming);
}
