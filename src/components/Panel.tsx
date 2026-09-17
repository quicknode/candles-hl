import type { ReactNode } from "react";

interface Props {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Padding inside the body. Off for charts that manage their own. */
  padded?: boolean;
}

/** One shell for every panel so headers, borders, and spacing line up. */
export default function Panel({ title, meta, children, className = "", padded = true }: Props) {
  return (
    <section className={`flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card ${className}`}>
      <header className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-1.5 lg:h-10 lg:flex-nowrap lg:py-0">
        <span className="panel-title">{title}</span>
        {meta && <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground lg:flex-nowrap">{meta}</div>}
      </header>
      <div className={`min-h-0 flex-1 ${padded ? "p-4" : ""}`}>{children}</div>
    </section>
  );
}
