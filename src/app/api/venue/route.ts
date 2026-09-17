import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const VENUE_INTERVALS = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "8h", "12h", "1d", "3d", "1w", "1M"]);

/** candleSnapshot through the Quicknode HyperCore endpoint. Sub-minute intervals return an empty list: the venue does not publish them. */
export async function POST(request: NextRequest) {
  const base = process.env.QN_HYPERCORE_URL;
  if (!base) return NextResponse.json({ error: "QN_HYPERCORE_URL is not set on the server." }, { status: 500 });

  const body = await request.json().catch(() => null);
  const { coin, interval, startTime, endTime } = body ?? {};
  if (typeof coin !== "string" || typeof interval !== "string" || !Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return NextResponse.json({ error: "coin, interval, startTime, endTime are required." }, { status: 400 });
  }
  if (!VENUE_INTERVALS.has(interval)) return NextResponse.json([]);

  const upstream = await fetch(`${base.replace(/\/$/, "")}/info`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval, startTime, endTime } }),
    cache: "no-store",
  });
  const text = await upstream.text();
  return new NextResponse(text, { status: upstream.status, headers: { "content-type": "application/json" } });
}
