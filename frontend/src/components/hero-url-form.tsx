"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Play } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PENDING_URL_KEY = "lectura:pendingUrl";

// Landing-page input: remembers the pasted URL, then sends the visitor to sign-in.
// The dashboard picks the URL back up and opens the "new video" dialog prefilled.
export function HeroUrlForm() {
  const [url, setUrl] = useState("");
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (url.trim()) sessionStorage.setItem(PENDING_URL_KEY, url.trim());
    } catch {}
    router.push("/login");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex max-w-xl items-center gap-2 rounded-full border border-border bg-card/80 p-1.5 pl-5 text-left shadow-lg shadow-primary/5 backdrop-blur transition-all focus-within:border-primary/50 focus-within:shadow-primary/15"
    >
      <Play className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://youtube.com/watch?v=…"
        aria-label="YouTube URL"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button type="submit" className={cn(buttonVariants(), "rounded-full px-5")}>
        Get notes <ChevronRight className="ml-1 h-4 w-4" />
      </button>
    </form>
  );
}
