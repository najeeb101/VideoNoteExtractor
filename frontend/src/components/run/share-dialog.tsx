"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Link2, Loader2, Share2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/** Create, copy or revoke the public read-only link for a run. */
export function ShareDialog({
  shareToken, onShare, onUnshare,
}: {
  shareToken: string | null;
  onShare: () => Promise<void>;
  onUnshare: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const link = shareToken ? `${origin}/share/${shareToken}` : "";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <Dialog>
      <DialogTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-muted-foreground")}>
        <Share2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Share</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share these notes</DialogTitle>
          <DialogDescription>
            Anyone with the link can read the notes, chapters and flashcards. Your chat, personal notes and stars stay private.
          </DialogDescription>
        </DialogHeader>

        {shareToken ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={link} aria-label="Share link" onFocus={(e) => e.target.select()} className="text-xs" />
              <Button variant="outline" size="icon" aria-label="Copy link" onClick={copy}>
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(onUnshare)} className="text-destructive hover:text-destructive">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Stop sharing
            </Button>
          </div>
        ) : (
          <Button disabled={busy} onClick={() => run(onShare)} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Create link
          </Button>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
