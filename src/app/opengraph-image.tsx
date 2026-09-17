import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const alt = "Candle Lab: how a Hyperliquid candle forms, from fills in Quicknode SQL Explorer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#6CFF75";
const UP = "#2f9e5f";
const DOWN = "#d64545";
const MUTED = "#aab3b9";

/** A row of candles drawn from fixed numbers so the card is identical on every build. */
const CANDLES = [
  [42, 60, 30, 52], [52, 70, 48, 66], [66, 72, 40, 44], [44, 50, 22, 26], [26, 38, 18, 36], [36, 58, 34, 56],
  [56, 64, 46, 50], [50, 54, 28, 32], [32, 48, 30, 46], [46, 62, 44, 60], [60, 66, 50, 54], [54, 58, 36, 38],
];

export default async function Image() {
  // Geist (OFL) ships with Next's image renderer. Geist Mono is avoided because its GSUB tables trip Satori's parser.
  const geist = await readFile(path.join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"));
  const chartTop = 150, chartHeight = 330, left = 640, step = 42;
  const y = (v: number) => chartTop + chartHeight - (v / 80) * chartHeight;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#22292e", color: "#f4f6f7", fontFamily: "Geist", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", width: 560 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 20, letterSpacing: 1, color: MUTED }}>{"// QUICKNODE · HYPERLIQUID"}</div>
            <div style={{ fontFamily: "Geist", fontSize: 84, lineHeight: 1, marginTop: 28, letterSpacing: -3 }}>Candle Lab</div>
            <div style={{ fontSize: 26, lineHeight: 1.35, marginTop: 28, color: MUTED }}>
              How a Hyperliquid candle forms, from the fills that make it. Built on SQL Explorer, checked against the venue.
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 20 }}>
            {["O", "H", "L", "C", "V", "N"].map((k) => (
              <div key={k} style={{ display: "flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 6, background: ACCENT, color: "#22292e" }}>{k}</div>
            ))}
            <div style={{ display: "flex", alignItems: "center", marginLeft: 12, color: MUTED, whiteSpace: "nowrap" }}>matches the venue</div>
          </div>
        </div>
        <div style={{ position: "absolute", left, top: chartTop, width: 1200 - left - 60, height: chartHeight, display: "flex", borderLeft: "1px solid rgba(255,255,255,0.12)" }} />
        {CANDLES.map(([o, h, l, c], i) => {
          const up = c >= o;
          const x = left + 30 + i * step;
          const bodyTop = y(Math.max(o, c)), bodyBottom = y(Math.min(o, c));
          const highlight = i === 9;
          return (
            <div key={i} style={{ position: "absolute", left: x - 12, top: 0, width: 24, height: 630, display: "flex" }}>
              {highlight && <div style={{ position: "absolute", left: -6, top: chartTop - 20, width: 36, height: chartHeight + 40, background: "rgba(108,255,117,0.14)", borderRadius: 4 }} />}
              <div style={{ position: "absolute", left: 10.5, top: y(h), width: 3, height: y(l) - y(h), background: highlight ? ACCENT : up ? UP : DOWN, borderRadius: 2 }} />
              <div style={{ position: "absolute", left: 0, top: bodyTop, width: 24, height: Math.max(4, bodyBottom - bodyTop), background: highlight ? ACCENT : up ? UP : DOWN, borderRadius: 3 }} />
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 640, bottom: 64, fontSize: 18, color: MUTED }}>2,855 fills · 345 blocks · one minute</div>
      </div>
    ),
    { ...size, fonts: [{ name: "Geist", data: geist, style: "normal", weight: 400 }] },
  );
}
