import type { Candle, Interval } from "@/lib/candles";

interface VenueBar { t: number; o: string; h: string; l: string; c: string; v: string; n: number }

/** The venue's own candles via the Quicknode HyperCore endpoint, proxied so the endpoint token stays on the server. */
export async function fetchOfficialCandles(coin: string, interval: Interval, startMs: number, endMs: number): Promise<Candle[]> {
  const response = await fetch("/api/venue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ coin, interval, startTime: startMs, endTime: endMs - 1 }),
  });
  if (!response.ok) throw new Error(`candleSnapshot ${response.status}`);
  const bars: VenueBar[] = await response.json();
  return bars.map((bar) => ({
    t: bar.t, o: Number(bar.o), h: Number(bar.h), l: Number(bar.l), c: Number(bar.c),
    v: Number(bar.v), usd: 0, n: bar.n, buyUsd: null, sellUsd: null, liqUsd: null, liqN: null,
  }));
}
