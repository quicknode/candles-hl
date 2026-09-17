export interface SqlResult<Row> {
  meta: { name: string; type: string }[];
  data: Row[];
  rows: number;
  statistics: { elapsed: number; rows_read: number; bytes_read: number };
  credits?: number;
}

const CLUSTER_ID = "hyperliquid-core-mainnet";

/** Runs a query through the app's own proxy route, which adds the SQL Explorer key server-side. */
export async function runSql<Row>(query: string): Promise<SqlResult<Row>> {
  const response = await fetch("/api/sql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? body?.error?.message ?? `SQL Explorer ${response.status}`);
  }
  return response.json();
}

/** What a reader would run themselves, with their own key. */
export function curlForQuery(query: string): string {
  const body = JSON.stringify({ query: query.replace(/\s+/g, " ").trim(), clusterId: CLUSTER_ID });
  return [
    "curl -s -X POST https://api.quicknode.com/sql/rest/v1/query \\",
    "  -H 'accept: application/json' -H 'content-type: application/json' \\",
    "  -H 'x-api-key: $QN_SQL_API_KEY' \\",
    `  -d '${body.replace(/'/g, "'\\''")}'`,
  ].join("\n");
}
