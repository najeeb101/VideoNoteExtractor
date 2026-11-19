"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudyPack } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Flashcards } from "./flashcards";
import type { LoadState } from "./notes-content";
import { Quiz } from "./quiz";
import { TimeChip } from "./time-chip";

type Mode = "cards" | "quiz" | "terms";

/** Study tab: flashcards, a quiz and key terms from the study pack. */
export function StudyPanel({
  study, status, onRetry, videoUrl, onSeek,
}: {
  study: StudyPack | null;
  status: LoadState;
  onRetry?: () => void;
  videoUrl?: string;
  onSeek?: (seconds: number) => void;
}) {
  const [mode, setMode] = useState<Mode>("cards");

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing flashcards and a quiz…
      </div>
    );
  }
  if (status === "error" || !study) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
        <p>Couldn&apos;t prepare study material right now.</p>
        {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
      </div>
    );
  }

  const modes: [Mode, string, number][] = [
    ["cards", "Flashcards", study.flashcards.length],
    ["quiz", "Quiz", study.quiz.length],
    ["terms", "Key terms", study.key_terms.length],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div role="tablist" aria-label="Study mode" className="inline-flex rounded-md border border-border p-0.5 text-xs">
        {modes.map(([m, label, n]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded px-2.5 py-1 transition-colors",
              mode === m ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label} <span className="text-muted-foreground">{n}</span>
          </button>
        ))}
      </div>

      {mode === "cards" && <Flashcards cards={study.flashcards} videoUrl={videoUrl} onSeek={onSeek} />}
      {mode === "quiz" && <Quiz questions={study.quiz} videoUrl={videoUrl} onSeek={onSeek} />}
      {mode === "terms" && (
        <dl className="divide-y divide-border">
          {study.key_terms.map((t) => (
            <div key={t.term} className="py-3">
              <dt className="flex items-center justify-between gap-2 text-sm font-medium">
                {t.term}
                <TimeChip ts={t.timestamp} videoUrl={videoUrl} onSeek={onSeek} />
              </dt>
              <dd className="mt-1 text-sm text-muted-foreground">{t.definition}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
