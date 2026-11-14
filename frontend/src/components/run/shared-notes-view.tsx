"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Chapters, chapterAt, type Chapter } from "@/components/run/chapters";
import { ExportMenu } from "@/components/run/export-menu";
import { NotesContent, chapterTitles, notesMarkdown, type NotesView } from "@/components/run/notes-content";
import { PrintView } from "@/components/run/print-view";
import { StudyPanel } from "@/components/run/study-panel";
import { YouTubePlayer, type YouTubePlayerHandle } from "@/components/run/youtube-player";
import type { SharedNotes } from "@/lib/api";
import { parseParts } from "@/lib/notes";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { formatClock, youtubeId } from "@/lib/youtube";

const TAB_TRIGGER = "h-full flex-none px-3 after:bg-primary group-data-horizontal/tabs:after:bottom-0";

/** Read-only notes page behind a share link: no chat, personal notes or stars. */
export function SharedNotesView({ shared }: { shared: SharedNotes }) {
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [view, setView] = useState<NotesView>(shared.reduced_notes_md ? "summary" : "detailed");
  const [chapterIdx, setChapterIdx] = useState(-1);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const { study } = shared;

  const videoId = youtubeId(shared.url);
  const chapters: Chapter[] = useMemo(() => {
    const titles = chapterTitles(study);
    return parseParts(shared.chunk_notes_md).map((p) => ({ start: p.start, title: titles[p.index] ?? `Part ${p.index + 1}` }));
  }, [shared.chunk_notes_md, study]);
  const seek = useCallback((seconds: number) => playerRef.current?.seekTo(seconds), []);
  const onSeek = videoId ? seek : undefined;
  const onTime = useCallback((t: number) => setChapterIdx(chapterAt(chapters, t)), [chapters]);

  const title = shared.title || "Lecture notes";
  const markdown = notesMarkdown(view, shared.reduced_notes_md, shared.chunk_notes_md, study);
  const player = videoId && <YouTubePlayer ref={playerRef} videoId={videoId} onTime={onTime} className="shrink-0" />;

  const mainTabs = (
    <Tabs defaultValue="notes" className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-2 sm:px-4">
        <TabsList variant="line" className="h-12 gap-0 p-0 group-data-horizontal/tabs:h-12">
          <TabsTrigger value="notes" className={TAB_TRIGGER}>Notes</TabsTrigger>
          {study && <TabsTrigger value="study" className={TAB_TRIGGER}>Study</TabsTrigger>}
        </TabsList>
      </div>
      <TabsContent value="notes" className="flex min-h-0 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <NotesContent
            view={view}
            onViewChange={setView}
            reducedMd={shared.reduced_notes_md}
            chunkMd={shared.chunk_notes_md}
            study={study}
            studyStatus="ready"
            videoUrl={shared.url}
            onSeek={onSeek}
          />
        </ScrollArea>
      </TabsContent>
      {study && (
        <TabsContent value="study" className="flex min-h-0 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <StudyPanel study={study} status="ready" videoUrl={shared.url} onSeek={onSeek} />
          </ScrollArea>
        </TabsContent>
      )}
    </Tabs>
  );

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BookOpen className="h-3.5 w-3.5" />
          </span>
          <span className="hidden sm:inline">Lectura</span>
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <h1 className="min-w-0 truncate text-sm font-medium" title={title}>{title}</h1>
        {shared.duration_seconds ? (
          <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">{formatClock(shared.duration_seconds)}</span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ExportMenu title={title} markdown={markdown} viewName={view} />
          <Link href="/" className={cn(buttonVariants({ size: "sm" }), "gap-1 rounded-full px-3")}>
            <span className="sm:hidden">Try it</span>
            <span className="hidden sm:inline">Make notes from your videos</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {isDesktop ? (
        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col">{mainTabs}</section>
          {player && (
            <aside className="flex w-[40%] min-w-[360px] max-w-[560px] shrink-0 flex-col border-l border-border">
              {player}
              <ScrollArea className="min-h-0 flex-1">
                <Chapters chapters={chapters} current={chapterIdx} onSeek={seek} layout="list" />
              </ScrollArea>
            </aside>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {player}
          {player && <Chapters chapters={chapters} current={chapterIdx} onSeek={seek} layout="chips" className="shrink-0 border-b border-border" />}
          {mainTabs}
        </div>
      )}

      <PrintView title={title} url={shared.url} markdown={markdown} />
    </div>
  );
}
