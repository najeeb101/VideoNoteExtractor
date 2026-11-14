"use client";

import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/youtube";

export interface Chapter {
  start: number;
  title: string;
}

/** Index of the chapter playing at `seconds` (chapters sorted by start). */
export function chapterAt(chapters: Chapter[], seconds: number): number {
  let current = -1;
  chapters.forEach((c, i) => {
    if (c.start <= seconds + 0.5) current = i;
  });
  return current;
}

export function Chapters({
  chapters, current, onSeek, layout, className,
}: {
  chapters: Chapter[];
  current: number;
  onSeek: (seconds: number) => void;
  layout: "list" | "chips";
  className?: string;
}) {
  if (chapters.length === 0) return null;

  if (layout === "chips") {
    return (
      <div className={cn("flex gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none]", className)}>
        {chapters.map((c, i) => (
          <button
            key={c.start}
            type="button"
            onClick={() => onSeek(c.start)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
              i === current
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="mr-1.5 font-mono text-primary">{formatClock(c.start)}</span>
            {c.title}
          </button>
        ))}
      </div>
    );
  }

  return (
    <nav aria-label="Chapters" className={cn("py-1", className)}>
      <p className="px-4 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Chapters</p>
      {chapters.map((c, i) => (
        <button
          key={c.start}
          type="button"
          onClick={() => onSeek(c.start)}
          aria-current={i === current || undefined}
          className={cn(
            "flex w-full items-baseline gap-3 px-4 py-1.5 text-left text-sm transition-colors hover:bg-muted",
            i === current ? "bg-primary/5 text-foreground" : "text-muted-foreground"
          )}
        >
          <span className="w-12 shrink-0 font-mono text-xs text-primary">{formatClock(c.start)}</span>
          <span className="min-w-0 truncate">{c.title}</span>
          {i === current && <span className="ml-auto h-1.5 w-1.5 shrink-0 self-center rounded-full bg-primary" />}
        </button>
      ))}
    </nav>
  );
}
