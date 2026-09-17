"use client";

import { motion } from "motion/react";
import type { Fill } from "@/lib/anatomy";
import Panel from "@/components/Panel";
import { useSize } from "@/lib/useSize";
import { formatClock, formatNum, formatPrice } from "@/lib/format";

interface Props {
  fills: Fill[];
  live: boolean;
}

const ROW_HEIGHT = 25;

/** Shows as many recent fills as fit the space it is given, newest on top. The newest row flashes; nothing fades, so the list never blanks. */
export default function Tape({ fills, live }: Props) {
  const { ref, size } = useSize<HTMLUListElement>();
  const limit = Math.max(1, Math.floor(size.height / ROW_HEIGHT));
  const rows = fills.slice(-limit).reverse();
  return (
    <Panel title={live ? "fill tape · live" : "fill tape"} padded={false} meta={<span>taker side · execution order</span>}>
      <div className="flex h-full flex-col">
        <div className="grid shrink-0 grid-cols-[5.5rem_3.5rem_1fr_4.5rem] gap-x-3 border-b border-border px-4 py-1.5 font-mono text-[11px] text-muted-foreground sm:grid-cols-[5.5rem_1fr_3.5rem_5rem_4.5rem]">
          <span>time</span><span className="hidden sm:block">oid</span><span>side</span><span className="text-right">price</span><span className="text-right">size</span>
        </div>
        {/* The list is absolutely positioned so it never contributes height; it fills whatever the row leaves. */}
        <div className="relative min-h-0 flex-1">
          <ul ref={ref} className="absolute inset-0 overflow-hidden px-4 font-mono text-xs">
            {rows.map((fill, index) => (
              <motion.li key={fill.tid} initial={index === 0 ? { backgroundColor: "rgba(108,255,117,0.35)" } : false} animate={{ backgroundColor: "rgba(108,255,117,0)" }}
                transition={{ duration: 0.6, ease: "easeOut" }} style={{ height: ROW_HEIGHT }}
                className={`grid grid-cols-[5.5rem_3.5rem_1fr_4.5rem] items-center gap-x-3 border-b border-border/50 sm:grid-cols-[5.5rem_1fr_3.5rem_5rem_4.5rem] ${fill.liq ? "text-down" : ""}`}>
                <span className="text-muted-foreground">{formatClock(fill.t)}</span>
                <span className="hidden truncate sm:block">{fill.aggressorOid}</span>
                <span>{fill.aggressor === "B" ? "buy" : "sell"}{fill.liq ? "·liq" : ""}</span>
                <span className="text-right">{formatPrice(fill.px)}</span>
                <span className="text-right">{formatNum(fill.sz, 3)}</span>
              </motion.li>
            ))}
            {!rows.length && <li className="py-6 text-center text-muted-foreground">{live ? "waiting for the next fill…" : "waiting for the first block…"}</li>}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
