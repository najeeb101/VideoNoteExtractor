"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { api, type SearchResult } from "@/lib/api";

// ts_headline wraps matches in << >>; strip markdown and timestamps around them.
function Snippet({ text }: { text: string }) {
  const clean = text.replace(/\*\*|`|^#+\s*/gm, "").replace(/\[\d{1,2}:\d{2}(?::\d{2})?[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  return (
    <>
      {clean.split(/(<<.*?>>)/g).map((part, i) =>
        part.startsWith("<<") ? (
          <mark key={i} className="rounded-sm bg-primary/15 px-0.5 text-foreground">{part.slice(2, -2)}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

/** Search box over all of the user's notes; shows `children` (the video list) when idle. */
export function NotesSearch({ children }: { children: ReactNode }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState(false);
  const query = q.trim();
  const active = query.length >= 2;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await createClient().auth.getSession();
        const found = await api.search(data.session?.access_token ?? "", query);
        if (!cancelled) { setResults(found); setError(false); }
      } catch {
        if (!cancelled) setError(true);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, active]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setResults(null); }}
          placeholder="Search all your notes…"
          aria-label="Search your notes"
          className="h-10 pl-9 pr-9"
        />
        {q && (
          <button
            type="button"
            onClick={() => { setQ(""); setResults(null); }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!active ? (
        children
      ) : error ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Search isn&apos;t available right now.</p>
      ) : results === null ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching…
        </div>
      ) : results.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No notes match &ldquo;{query}&rdquo;.</p>
      ) : (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.run_id}>
              <Link
                href={`/run/${r.run_id}`}
                className="block rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30"
              >
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground"><Snippet text={r.snippet} /></p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
