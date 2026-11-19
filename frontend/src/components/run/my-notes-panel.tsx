"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

type SaveState = "idle" | "saving" | "saved" | "error";

/** A private scratchpad per video, autosaved shortly after typing stops. */
export function MyNotesPanel({
  initialBody, onSave,
}: {
  initialBody: string;
  onSave: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState(initialBody);
  const [state, setState] = useState<SaveState>("idle");
  const saved = useRef(initialBody);

  useEffect(() => {
    if (body === saved.current) return;
    const timer = setTimeout(async () => {
      setState("saving");
      try {
        await onSave(body);
        saved.current = body;
        setState("saved");
      } catch {
        setState("error");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [body, onSave]);

  const label = { idle: "", saving: "Saving…", saved: "Saved", error: "Couldn't save. Keep typing to retry." }[state];

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-2 p-4 sm:p-6">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Only you can see these notes.</span>
        <span aria-live="polite" className={state === "error" ? "text-destructive" : ""}>{label}</span>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Your own notes, questions, things to review…"
        className="min-h-[50vh] flex-1 resize-none text-sm leading-relaxed"
      />
    </div>
  );
}
