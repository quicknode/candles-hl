import Panel from "@/components/Panel";

/** Placeholder blocks that hold a panel's shape while its data loads, so nothing on screen jumps. */
function Bone({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded-sm bg-muted ${className}`} style={style} />;
}

export function ChartSkeleton() {
  return (
    <div className="flex h-full flex-col justify-end gap-1 p-4">
      <div className="flex flex-1 items-end gap-[3px]">
        {Array.from({ length: 48 }).map((_, index) => (
          <Bone key={index} className="w-full" />
        )).map((bone, index) => (
          <div key={index} className="flex w-full items-end" style={{ height: `${35 + ((index * 37) % 55)}%` }}>{bone}</div>
        ))}
      </div>
      <Bone className="h-3 w-40" />
    </div>
  );
}

export function BuilderSkeleton({ live }: { live?: boolean }) {
  return (
    <Panel title={live ? "building · live" : "building"} padded={false} meta={<Bone className="h-3 w-40" />}>
      <div className="flex h-full flex-col">
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_9rem] gap-3 px-4 pt-2">
          <div className="relative min-h-0">
            <div className="absolute left-[27%] top-6 bottom-6 w-[3px] -translate-x-1/2 animate-pulse rounded bg-muted" />
            <div className="absolute left-[27%] top-[35%] h-[30%] w-11 -translate-x-1/2 animate-pulse rounded-sm bg-muted" />
            <div className="absolute left-[45%] top-[18%] space-y-5">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-3 w-32" />)}</div>
          </div>
          <div className="flex flex-col justify-center gap-3">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} className="h-6 w-20" />)}</div>
        </div>
        <div className="shrink-0 border-t border-border px-4 py-2">
          <div className="flex items-center gap-2"><Bone className="h-8 w-8 rounded-full" /><Bone className="h-6 w-28" /><Bone className="h-1 flex-1" /><Bone className="h-6 w-36" /></div>
          <Bone className="mt-2 h-3 w-64" />
        </div>
      </div>
    </Panel>
  );
}

/** Mirrors Steps exactly: same header, a tab row of the same height, and the same fixed content height. */
export function StepsSkeleton() {
  return (
    <Panel title="how it forms" padded={false} meta={<Bone className="h-3 w-24" />}>
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 border-b border-border">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="flex items-center px-4 py-1.5 text-sm"><Bone className="h-3 w-16" /><span className="invisible">x</span></div>)}
        </div>
        <div className="min-h-[18rem] space-y-3 overflow-hidden p-4 lg:h-[18rem]">
          <Bone className="h-5 w-56" />
          <Bone className="h-3 w-full max-w-3xl" />
          <Bone className="h-3 w-4/5 max-w-2xl" />
          <Bone className="h-40 w-full" />
        </div>
      </div>
    </Panel>
  );
}

export function TapeSkeleton({ live }: { live?: boolean }) {
  return (
    <Panel title={live ? "fill tape · live" : "fill tape"} padded={false} meta={<span>taker side · execution order</span>}>
      <div className="space-y-2 px-4 py-3">{Array.from({ length: 10 }).map((_, i) => <Bone key={i} className="h-4 w-full" style={{ opacity: 1 - i * 0.08 }} />)}</div>
    </Panel>
  );
}
