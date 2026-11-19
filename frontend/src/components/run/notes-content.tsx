"use client";

import { Star } from "lucide-react";
import { Markdown } from "@/components/markdown";
import type { StudyPack } from "@/lib/api";
import { readableChunkNotes, starredMarkdown } from "@/lib/notes";
import { cn } from "@/lib/utils";

export type NotesView = "summary" | "detailed" | "starred";
export type LoadState = "loading" | "ready" | "error";

/** Chapter titles from the study pack, by chunk part index. */
export function chapterTitles(study: StudyPack | null): Record<number, string> {
  return Object.fromEntries((study?.chapters ?? []).map((c) => [c.part, c.title]));
}

/** The markdown shown (and exported) for a view. */
export function notesMarkdown(
  view: NotesView,
  reducedMd: string,
  chunkMd: string,
  study: StudyPack | null,
  starred?: Set<string>,
): string {
  if (view === "starred") return starredMarkdown([reducedMd, chunkMd], starred ?? new Set());
  if (view === "detailed") return readableChunkNotes(chunkMd, chapterTitles(study));
  return reducedMd;
}

function ViewToggle({
  value, onChange, hasSummary, hasDetailed, starCount,
}: {
  value: NotesView;
  onChange: (v: NotesView) => void;
  hasSummary: boolean;
  hasDetailed: boolean;
  starCount?: number;
}) {
  const options: [NotesView, React.ReactNode][] = [];
  if (hasSummary) options.push(["summary", "Overview"]);
  if (hasDetailed) options.push(["detailed", "Detailed"]);
  if (starCount || value === "starred") {
    options.push(["starred", <span key="s" className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-current text-amber-500" />{starCount ?? 0}</span>]);
  }
  if (options.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Notes view" className="inline-flex rounded-md border border-border p-0.5 text-xs">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          aria-label={v === "starred" ? "Starred" : undefined}
          onClick={() => onChange(v)}
          className={cn(
            "rounded px-2.5 py-1 transition-colors",
            value === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Tldr({ study, status }: { study: StudyPack | null; status: LoadState }) {
  if (status === "loading") {
    return (
      <div className="mb-6 animate-pulse rounded-lg border border-border bg-muted/30 p-4">
        <div className="mb-2 h-3 w-12 rounded bg-muted" />
        <div className="mb-1.5 h-3 w-full rounded bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
      </div>
    );
  }
  if (!study?.tldr) return null;
  return (
    <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">TL;DR</p>
      <p className="text-sm leading-relaxed text-foreground">{study.tldr}</p>
    </div>
  );
}

/** Notes column: view switch, TL;DR, then the notes for the chosen view. */
export function NotesContent({
  view, onViewChange, reducedMd, chunkMd, study, studyStatus, videoUrl, onSeek, onAskHeading, starred, onToggleStar,
}: {
  view: NotesView;
  onViewChange: (v: NotesView) => void;
  reducedMd: string;
  chunkMd: string;
  study: StudyPack | null;
  studyStatus: LoadState;
  videoUrl?: string;
  onSeek?: (seconds: number) => void;
  onAskHeading?: (heading: string) => void;
  /** Omit both to hide stars (e.g. on a shared page). */
  starred?: Set<string>;
  onToggleStar?: (key: string) => void;
}) {
  const markdown = notesMarkdown(view, reducedMd, chunkMd, study, starred);
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-end">
        <ViewToggle
          value={view}
          onChange={onViewChange}
          hasSummary={!!reducedMd}
          hasDetailed={!!chunkMd}
          starCount={onToggleStar ? starred?.size : undefined}
        />
      </div>
      {view !== "starred" && <Tldr study={study} status={studyStatus} />}
      {view === "starred" && !markdown ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Star bullets in your notes to collect them here.</p>
      ) : (
        <Markdown
          content={markdown}
          videoUrl={videoUrl}
          onSeek={onSeek}
          onAskHeading={view === "summary" ? onAskHeading : undefined}
          starred={starred}
          onToggleStar={onToggleStar}
        />
      )}
    </div>
  );
}
