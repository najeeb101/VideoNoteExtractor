"use client";

import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudyPack } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TimeChip } from "./time-chip";

type Question = StudyPack["quiz"][number];

/** One multiple-choice question at a time, with the explanation after each answer. */
export function Quiz({
  questions, videoUrl, onSeek,
}: {
  questions: Question[];
  videoUrl?: string;
  onSeek?: (seconds: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  if (questions.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No quiz for this video.</p>;

  if (idx >= questions.length) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-lg font-semibold">You scored {score} / {questions.length}</p>
        <p className="text-sm text-muted-foreground">
          {score === questions.length ? "Perfect." : "Review the parts you missed with the timestamps, then try again."}
        </p>
        <Button variant="outline" className="gap-1.5" onClick={() => { setIdx(0); setPicked(null); setScore(0); }}>
          <RotateCcw className="h-3.5 w-3.5" /> Try again
        </Button>
      </div>
    );
  }

  const q = questions[idx];
  const answered = picked !== null;

  function pick(i: number) {
    if (answered) return;
    setPicked(i);
    if (i === q.answer_index) setScore((s) => s + 1);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Question {idx + 1} of {questions.length} · score {score}</p>
      <p className="text-base font-medium leading-snug">{q.question}</p>
      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer_index;
          const isPicked = i === picked;
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(i)}
              disabled={answered}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                !answered && "border-border hover:border-primary/40 hover:bg-muted/50",
                answered && isAnswer && "border-green-500/50 bg-green-500/10",
                answered && isPicked && !isAnswer && "border-red-500/50 bg-red-500/10",
                answered && !isAnswer && !isPicked && "border-border opacity-60"
              )}
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                {answered && isAnswer ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  : answered && isPicked ? <X className="h-4 w-4 text-red-600 dark:text-red-400" />
                  : <span className="font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + i)}</span>}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="space-y-3 rounded-lg bg-muted/40 p-3 text-sm">
          <p>
            <span className="font-medium">{picked === q.answer_index ? "Correct. " : "Not quite. "}</span>
            <span className="text-muted-foreground">{q.explanation}</span>
          </p>
          <div className="flex items-center justify-between gap-2">
            <TimeChip ts={q.timestamp} videoUrl={videoUrl} onSeek={onSeek} label="Watch this part" />
            <Button size="sm" onClick={() => { setIdx(idx + 1); setPicked(null); }}>
              {idx + 1 < questions.length ? "Next question" : "See results"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
