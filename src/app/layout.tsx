import type { Metadata } from "next";
import { Onest } from "next/font/google";
import "./globals.css";

const onest = Onest({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-onest", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
const DESCRIPTION = "Watch one minute of Hyperliquid fills become an OHLCV candle, then extract the same data yourself with one Quicknode SQL Explorer query.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Candle Lab",
  description: DESCRIPTION,
  openGraph: { title: "Candle Lab", description: DESCRIPTION, type: "website", siteName: "Candle Lab" },
  twitter: { card: "summary_large_image", title: "Candle Lab", description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-ds="chat" data-appearance="dark" className={onest.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
