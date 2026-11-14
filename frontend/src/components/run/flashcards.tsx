"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudyPack } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TimeChip } from "./time-chip";

type Card = StudyPack["flashcards"][number];

function shuffled(ids: number[]) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Flip cards with "Got it / Again" self-grading (kept for this visit only). */
export function Flashcards({
  cards, videoUrl, onSeek,
}: {
  cards: Card[];
  videoUrl?: string;
  onSeek?: (seconds: number) => void;
}) {
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  if (cards.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No flashcards for this video.</p>;

  const finished = pos >= order.length;

  function go(to: number) {
    setPos(Math.max(0, Math.min(to, order.length)));
    setFlipped(false);
  }
  function grade(gotIt: boolean) {
    const id = order[pos];
    setKnown((prev) => {
      const next = new Set(prev);
      if (gotIt) next.add(id);
      else next.delete(id);
      return next;
    });
    go(pos + 1);
  }
  function restart(ids: number[]) {
    setOrder(ids);
    setPos(0);
    setFlipped(false);
  }

  if (finished) {
    const missed = order.filter((id) => !known.has(id));
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-lg font-semibold">You know {order.length - missed.length} of {order.length}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {missed.length > 0 && missed.length < order.length && (
            <Button onClick={() => restart(missed)}>Review the {missed.length} you missed</Button>
          )}
          <Button variant="outline" className="gap-1.5" onClick={() => { setKnown(new Set()); restart(cards.map((_, i) => i)); }}>
            <RotateCcw className="h-3.5 w-3.5" /> Start over
          </Button>
        </div>
      </div>
    );
  }

  const card = cards[order[pos]];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Card {pos + 1} of {order.length} · {known.size} known</span>
        <button
          type="button"
          onClick={() => restart(shuffled(order))}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Shuffle className="h-3 w-3" /> Shuffle
        </button>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show question" : "Show answer"}
        className={cn(
          "flex min-h-52 w-full flex-col items-center justify-center gap-3 rounded-xl border p-6 text-center transition-colors",
          flipped ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:border-primary/20"
        )}
      >
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {flipped ? "Answer" : "Question"}
        </span>
        <span className={cn("text-balance", flipped ? "text-sm leading-relaxed" : "text-base font-medium")}>
          {flipped ? card.back : card.front}
        </span>
        {!flipped && <span className="text-xs text-muted-foreground">Click to reveal the answer</span>}
      </button>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" aria-label="Previous card" disabled={pos === 0} onClick={() => go(pos - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {flipped ? (
          <div className="flex flex-1 justify-center gap-2">
            <Button variant="outline" onClick={() => grade(false)}>Again</Button>
            <Button onClick={() => grade(true)}>Got it</Button>
          </div>
        ) : (
          <div className="flex flex-1 justify-center">
            <TimeChip ts={card.timestamp} videoUrl={videoUrl} onSeek={onSeek} label="Watch this part" />
          </div>
        )}
        <Button variant="ghost" size="icon" aria-label="Next card" onClick={() => go(pos + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
