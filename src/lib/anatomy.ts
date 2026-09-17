import { INTERVALS, MAX_BARS, assertCoin, toClickhouseTime, type Interval } from "@/lib/candles";

/** One trade inside a bar, reduced to what the walkthrough needs. */
export interface Fill {
  tid: number;
  t: number;
  block: number;
  px: number;
  sz: number;
  aggressor: "B" | "A";
  aggressorOid: number;
  restingOid: number;
  liq: boolean;
  liqMarkPx: number | null;
}

/**
 * Every trade in one bar, already in execution order. Two rows per trade in
 * the fills table collapse to one here; the aggressor is the row with crossed = 1.
 */
export function fillsForBarQuery(coin: string, interval: Interval, barStartMs: number): string {
  const barEndMs = barStartMs + INTERVALS[interval].seconds * 1000;
  return `
SELECT
  tid,
  any(time)                                          AS ts,
  any(block_number)                                  AS block,
  any(price)                                         AS px,
  any(size)                                          AS sz,
  anyIf(side, crossed = 1)                           AS aggressor_side,
  anyIf(oid, crossed = 1)                            AS aggressor_oid,
  anyIf(oid, crossed = 0)                            AS resting_oid,
  max(is_liquidation)                                AS liq,
  anyIf(liquidation_mark_price, is_liquidation = 1)  AS liq_mark_px
FROM hyperliquid_fills
WHERE coin = '${assertCoin(coin)}'
  AND block_time >= '${toClickhouseTime(barStartMs - 1000)}'
  AND block_time <  '${toClickhouseTime(barEndMs + 1000)}'
  AND time >= '${toClickhouseTime(barStartMs)}'
  AND time <  '${toClickhouseTime(barEndMs)}'
GROUP BY tid
ORDER BY block, aggressor_oid, if(aggressor_side = 'B', px, -px)
LIMIT ${MAX_BARS * 10}`.trim();
}

interface FillRow {
  tid: number | string; ts: string; block: number | string; px: number | string; sz: number | string;
  aggressor_side: "B" | "A"; aggressor_oid: number | string; resting_oid: number | string;
  liq: number | string; liq_mark_px: number | string | null;
}

export function rowsToFills(rows: FillRow[]): Fill[] {
  return rows.map((row) => ({
    tid: Number(row.tid),
    t: Date.parse(row.ts.replace(" ", "T") + "Z"),
    block: Number(row.block),
    px: Number(row.px),
    sz: Number(row.sz),
    aggressor: row.aggressor_side,
    aggressorOid: Number(row.aggressor_oid),
    restingOid: Number(row.resting_oid),
    liq: Number(row.liq) === 1,
    liqMarkPx: row.liq_mark_px === null ? null : Number(row.liq_mark_px),
  }));
}

export interface BuiltCandle {
  o: number | null; h: number | null; l: number | null; c: number | null;
  v: number; usd: number; n: number;
  /** Low and high if liquidation fills were wrongly included. */
  lWithLiq: number | null; hWithLiq: number | null;
  /** Close if fills were wrongly ordered by trade id. */
  cByTid: number | null; oByTid: number | null;
  liqN: number; liqUsd: number; blocks: number;
}

/** Assemble a candle from fills the way the venue does, and also the two wrong ways, for contrast. */
export function buildCandle(fills: Fill[]): BuiltCandle {
  const priced = fills.filter((fill) => !fill.liq);
  const byTid = fills.filter((fill) => !fill.liq).slice().sort((a, b) => a.t - b.t || a.tid - b.tid);
  const sum = (list: Fill[], pick: (fill: Fill) => number) => list.reduce((total, fill) => total + pick(fill), 0);
  return {
    o: priced[0]?.px ?? null,
    c: priced[priced.length - 1]?.px ?? null,
    h: priced.length ? Math.max(...priced.map((fill) => fill.px)) : null,
    l: priced.length ? Math.min(...priced.map((fill) => fill.px)) : null,
    v: sum(fills, (fill) => fill.sz),
    usd: sum(fills, (fill) => fill.px * fill.sz),
    n: fills.length,
    lWithLiq: fills.length ? Math.min(...fills.map((fill) => fill.px)) : null,
    hWithLiq: fills.length ? Math.max(...fills.map((fill) => fill.px)) : null,
    cByTid: byTid[byTid.length - 1]?.px ?? null,
    oByTid: byTid[0]?.px ?? null,
    liqN: fills.filter((fill) => fill.liq).length,
    liqUsd: sum(fills.filter((fill) => fill.liq), (fill) => fill.px * fill.sz),
    blocks: new Set(fills.map((fill) => fill.block)).size,
  };
}
