"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatPanel, type ChatHandle } from "@/components/run/chat-panel";
import { Chapters, chapterAt, type Chapter } from "@/components/run/chapters";
import { ExportMenu } from "@/components/run/export-menu";
import { MyNotesPanel } from "@/components/run/my-notes-panel";
import {
  NotesContent, chapterTitles, notesMarkdown, type LoadState, type NotesView,
} from "@/components/run/notes-content";
import { PrintView } from "@/components/run/print-view";
import { ShareDialog } from "@/components/run/share-dialog";
import { StudyPanel } from "@/components/run/study-panel";
import { YouTubePlayer, type YouTubePlayerHandle } from "@/components/run/youtube-player";
import { createClient } from "@/lib/supabase/client";
import { api, type MyNotes, type Notes, type Run, type StudyPack } from "@/lib/api";
import { parseParts } from "@/lib/notes";
import { useMediaQuery } from "@/lib/use-media-query";
import { formatClock, youtubeId } from "@/lib/youtube";

// Underlined tabs flush with the bottom of the header bar.
const TAB_TRIGGER = "h-full flex-none px-3 after:bg-primary group-data-horizontal/tabs:after:bottom-0";

async function accessToken() {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? "";
}

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [run, setRun] = useState<Run | null>(null);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [loading, setLoading] = useState(true);
  const [study, setStudy] = useState<StudyPack | null>(null);
  const [studyStatus, setStudyStatus] = useState<LoadState>("loading");
  // Personal notes + stars; null when unavailable (then stars and "My notes" are hidden).
  const [mine, setMine] = useState<MyNotes | null>(null);
  const [view, setView] = useState<NotesView>("summary");
  const [tab, setTab] = useState("notes");
  const [chapterIdx, setChapterIdx] = useState(-1);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const chatRef = useRef<ChatHandle>(null);

  const loadStudy = useCallback(async () => {
    setStudyStatus("loading");
    try {
      setStudy(await api.runs.study(await accessToken(), id));
      setStudyStatus("ready");
    } catch {
      setStudyStatus("error");
    }
  }, [id]);

  useEffect(() => {
    async function load() {
      const token = await accessToken();
      const [runRes, notesRes, mineRes] = await Promise.allSettled([
        api.runs.get(token, id),
        api.runs.notes(token, id),
        api.runs.myNotes(token, id),
      ]);
      if (runRes.status === "fulfilled") setRun(runRes.value);
      if (mineRes.status === "fulfilled") setMine(mineRes.value);
      if (notesRes.status === "fulfilled") {
        setNotes(notesRes.value);
        if (!notesRes.value.reduced_notes_md) setView("detailed");
      }
      setLoading(false);
      if (notesRes.status === "fulfilled") loadStudy();
    }
    load();
  }, [id, loadStudy]);

  const videoId = youtubeId(run?.url);
  const chapters: Chapter[] = useMemo(() => {
    const titles = chapterTitles(study);
    return parseParts(notes?.chunk_notes_md).map((p) => ({ start: p.start, title: titles[p.index] ?? `Part ${p.index + 1}` }));
  }, [notes, study]);
  const starred = useMemo(() => new Set(mine?.starred ?? []), [mine]);

  const seek = useCallback((seconds: number) => playerRef.current?.seekTo(seconds), []);
  const onSeek = videoId ? seek : undefined;
  const onTime = useCallback((t: number) => setChapterIdx(chapterAt(chapters, t)), [chapters]);

  const saveBody = useCallback(async (body: string) => {
    await api.runs.saveMyNotes(await accessToken(), id, { body });
  }, [id]);

  async function toggleStar(key: string) {
    if (!mine) return;
    const before = mine;
    const next = starred.has(key) ? mine.starred.filter((k) => k !== key) : [...mine.starred, key];
    setMine({ ...mine, starred: next });
    try {
      await api.runs.saveMyNotes(await accessToken(), id, { starred: next });
    } catch {
      setMine(before);
    }
  }

  function askAbout(heading: string) {
    if (!isDesktop) setTab("chat");
    chatRef.current?.ask(`Explain more about "${heading}"`);
  }

  async function share() {
    const { share_token } = await api.runs.share(await accessToken(), id);
    setRun((r) => (r ? { ...r, share_token } : r));
  }
  async function unshare() {
    await api.runs.unshare(await accessToken(), id);
    setRun((r) => (r ? { ...r, share_token: null } : r));
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
  const reducedMd = notes.reduced_notes_md ?? "";
  const chunkMd = notes.chunk_notes_md ?? "";
  const markdown = notesMarkdown(view, reducedMd, chunkMd, study, starred);
  const activeTab = (isDesktop && tab === "chat") || (!mine && tab === "mine") ? "notes" : tab;

  const player = videoId && (
    <YouTubePlayer ref={playerRef} videoId={videoId} onTime={onTime} className="shrink-0" />
  );
  const chat = (
    <ChatPanel ref={chatRef} runId={id} videoUrl={run?.url} onSeek={onSeek} className="min-h-0 flex-1" />
  );

  const mainTabs = (
    <Tabs value={activeTab} onValueChange={(v) => setTab(String(v))} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-2 sm:px-4">
        <TabsList variant="line" className="h-12 gap-0 overflow-x-auto p-0 group-data-horizontal/tabs:h-12">
          <TabsTrigger value="notes" className={TAB_TRIGGER}>Notes</TabsTrigger>
          <TabsTrigger value="study" className={TAB_TRIGGER}>Study</TabsTrigger>
          {mine && <TabsTrigger value="mine" className={TAB_TRIGGER}>My notes</TabsTrigger>}
          {!isDesktop && <TabsTrigger value="chat" className={TAB_TRIGGER}>Chat</TabsTrigger>}
        </TabsList>
      </div>

      <TabsContent value="notes" className="flex min-h-0 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <NotesContent
            view={view}
            onViewChange={setView}
            reducedMd={reducedMd}
            chunkMd={chunkMd}
            study={study}
            studyStatus={studyStatus}
            videoUrl={run?.url}
            onSeek={onSeek}
            onAskHeading={askAbout}
            starred={mine ? starred : undefined}
            onToggleStar={mine ? toggleStar : undefined}
          />
        </ScrollArea>
      </TabsContent>
      <TabsContent value="study" className="flex min-h-0 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <StudyPanel study={study} status={studyStatus} onRetry={loadStudy} videoUrl={run?.url} onSeek={onSeek} />
        </ScrollArea>
      </TabsContent>
      {mine && (
        <TabsContent value="mine" keepMounted className="flex min-h-0 flex-col">
          <MyNotesPanel initialBody={mine.body} onSave={saveBody} />
        </TabsContent>
      )}
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
          {run && <ShareDialog shareToken={run.share_token ?? null} onShare={share} onUnshare={unshare} />}
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
          <section className="flex min-w-0 flex-1 flex-col">{mainTabs}</section>
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
          {mainTabs}
        </div>
      )}

      <PrintView title={title} url={run?.url} markdown={markdown} />
    </div>
  );
}
