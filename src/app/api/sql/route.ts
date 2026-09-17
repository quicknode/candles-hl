import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const QUERY_ENDPOINT = "https://api.quicknode.com/sql/rest/v1/query";
const CLUSTER_ID = "hyperliquid-core-mainnet";
const MAX_QUERY_LENGTH = 20_000;

/** Forwards one read-only query to SQL Explorer with the server's key. The browser never sees the key. */
export async function POST(request: NextRequest) {
  const apiKey = process.env.QN_SQL_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "QN_SQL_API_KEY is not set on the server." }, { status: 500 });

  const body = await request.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query || query.length > MAX_QUERY_LENGTH || !/^select\b/i.test(query) || !/\bhyperliquid_/i.test(query)) {
    return NextResponse.json({ error: "Only SELECT queries against hyperliquid_ tables are accepted." }, { status: 400 });
  }

  const upstream = await fetch(QUERY_ENDPOINT, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "x-api-key": apiKey, "user-agent": "candle-lab/0.1" },
    body: JSON.stringify({ query, clusterId: CLUSTER_ID }),
    cache: "no-store",
  });
  const text = await upstream.text();
  return new NextResponse(text, { status: upstream.status, headers: { "content-type": "application/json" } });
}
