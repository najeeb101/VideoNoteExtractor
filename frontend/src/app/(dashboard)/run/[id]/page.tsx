"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/markdown";
import { ChatPanel, type ChatHandle } from "@/components/run/chat-panel";
import { Chapters, chapterAt, type Chapter } from "@/components/run/chapters";
import { ExportMenu } from "@/components/run/export-menu";
import { PrintView } from "@/components/run/print-view";
import { YouTubePlayer, type YouTubePlayerHandle } from "@/components/run/youtube-player";
import { createClient } from "@/lib/supabase/client";
import { api, type Notes, type Run } from "@/lib/api";
import { parseParts, readableChunkNotes } from "@/lib/notes";
import { useMediaQuery } from "@/lib/use-media-query";
import { formatClock, youtubeId } from "@/lib/youtube";
import { cn } from "@/lib/utils";

// Underlined tabs flush with the bottom of the header bar.
const TAB_TRIGGER = "h-full flex-none px-3 after:bg-primary group-data-horizontal/tabs:after:bottom-0";

type View = "summary" | "detailed";

function ViewToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const options: [View, string][] = [["summary", "Overview"], ["detailed", "Detailed"]];
  return (
    <div role="radiogroup" aria-label="Level of detail" className="inline-flex rounded-md border border-border p-0.5 text-xs">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
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

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [run, setRun] = useState<Run | null>(null);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("summary");
  const [tab, setTab] = useState("notes");
  const [chapterIdx, setChapterIdx] = useState(-1);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const chatRef = useRef<ChatHandle>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? "";
      const [runRes, notesRes] = await Promise.allSettled([api.runs.get(token, id), api.runs.notes(token, id)]);
      if (runRes.status === "fulfilled") setRun(runRes.value);
      if (notesRes.status === "fulfilled") {
        setNotes(notesRes.value);
        if (!notesRes.value.reduced_notes_md) setView("detailed");
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const videoId = youtubeId(run?.url);
  const chapters: Chapter[] = useMemo(
    () => parseParts(notes?.chunk_notes_md).map((p) => ({ start: p.start, title: `Part ${p.index + 1}` })),
    [notes]
  );
  const seek = useCallback((seconds: number) => playerRef.current?.seekTo(seconds), []);
  const onSeek = videoId ? seek : undefined;
  const onTime = useCallback((t: number) => setChapterIdx(chapterAt(chapters, t)), [chapters]);

  function askAbout(heading: string) {
    if (!isDesktop) setTab("chat");
    chatRef.current?.ask(`Explain more about "${heading}"`);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading notes…
      </div>
    );
  }

  if (!notes) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>Notes not found or still processing.</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>Back to dashboard</Button>
      </div>
    );
  }

  const title = run?.title || run?.url || "Lecture notes";
  const hasBothViews = !!notes.reduced_notes_md && !!notes.chunk_notes_md;
  const markdown = view === "summary" ? notes.reduced_notes_md : readableChunkNotes(notes.chunk_notes_md ?? "");
  const activeTab = isDesktop && tab === "chat" ? "notes" : tab;

  const player = videoId && (
    <YouTubePlayer ref={playerRef} videoId={videoId} onTime={onTime} className="shrink-0" />
  );
  const chat = (
    <ChatPanel ref={chatRef} runId={id} videoUrl={run?.url} onSeek={onSeek} className="min-h-0 flex-1" />
  );

  const notesTabs = (
    <Tabs value={activeTab} onValueChange={(v) => setTab(String(v))} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-2 sm:px-4">
        <TabsList variant="line" className="h-12 gap-0 p-0 group-data-horizontal/tabs:h-12">
          <TabsTrigger value="notes" className={TAB_TRIGGER}>Notes</TabsTrigger>
          {!isDesktop && <TabsTrigger value="chat" className={TAB_TRIGGER}>Chat</TabsTrigger>}
        </TabsList>
        {activeTab === "notes" && hasBothViews && <ViewToggle value={view} onChange={setView} />}
      </div>

      <TabsContent value="notes" className="flex min-h-0 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-3xl p-4 sm:p-6">
            <Markdown
              content={markdown}
              videoUrl={run?.url}
              onSeek={onSeek}
              onAskHeading={view === "summary" ? askAbout : undefined}
            />
          </div>
        </ScrollArea>
      </TabsContent>
      {!isDesktop && (
        <TabsContent value="chat" keepMounted className="flex min-h-0 flex-col">
          {chat}
        </TabsContent>
      )}
    </Tabs>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-6">
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <h1 className="min-w-0 truncate text-sm font-medium" title={title}>{title}</h1>
        {run?.duration_seconds ? (
          <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">{formatClock(run.duration_seconds)}</span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {run?.url && !videoId && (
            <a
              href={run.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Watch</span>
            </a>
          )}
          <ExportMenu
            title={title}
            markdown={markdown}
            viewName={view}
            transcript={notes.transcript_timestamped_txt || notes.transcript_txt}
          />
        </div>
      </div>

      {isDesktop ? (
        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col">{notesTabs}</section>
          <aside className="flex w-[40%] min-w-[360px] max-w-[560px] shrink-0 flex-col border-l border-border">
            {player}
            {player && (
              <Chapters
                chapters={chapters}
                current={chapterIdx}
                onSeek={seek}
                layout="list"
                className="max-h-[28vh] shrink-0 overflow-y-auto border-b border-border"
              />
            )}
            {chat}
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {player}
          {player && (
            <Chapters chapters={chapters} current={chapterIdx} onSeek={seek} layout="chips" className="shrink-0 border-b border-border" />
          )}
          {notesTabs}
        </div>
      )}

      <PrintView title={title} url={run?.url} markdown={markdown} />
    </div>
  );
}
