"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Video, Clock, Trash2, ChevronRight, Loader2, AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { api, type Run } from "@/lib/api";
import Link from "next/link";
import { formatDistanceToNow, differenceInDays } from "date-fns";

function statusColor(status: Run["status"]) {
  return {
    done: "bg-green-500/10 text-green-600 dark:text-green-400",
    processing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    queued: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  }[status];
}

function formatDuration(s: number | null) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function loadRuns() {
    const token = await getToken();
    try {
      const data = await api.runs.list(token);
      setRuns(data);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadRuns(); }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setRunError(null);
    setLogs([]);
    setProgress(0);

    try {
      const token = await getToken();
      const { run_id } = await api.runs.create(token, url.trim());
      setActiveRunId(run_id);
      setUrl("");

      const es = api.stream(run_id, token);
      let prog = 0;

      es.onmessage = (ev) => {
        const line: string = ev.data;
        setLogs((prev) => [...prev, line]);
        prog = Math.min(prog + 8, 95);
        setProgress(prog);
        if (line.includes("Pipeline complete") || line.includes("done")) {
          setProgress(100);
          es.close();
          loadRuns();
          setActiveRunId(null);
        }
        if (line.includes("ERROR") || line.includes("error")) {
          setRunError(line);
          es.close();
          setActiveRunId(null);
        }
      };
      es.onerror = () => {
        es.close();
        setActiveRunId(null);
        loadRuns();
      };
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
    setSubmitting(false);
  }

  async function handleDelete(runId: string) {
    const token = await getToken();
    try {
      await api.runs.delete(token, runId);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch {}
  }

  const freeUsed = runs.filter((r) => {
    const d = new Date(r.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your Videos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {freeUsed}/3 free videos used this month
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} disabled={freeUsed >= 3} className="gap-2">
          <Plus className="h-4 w-4" />
          New video
        </Button>
      </div>

      {/* Free tier bar */}
      <div className="mb-8 rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Free tier usage</span>
          <span className="font-medium">{freeUsed} / 3 videos</span>
        </div>
        <Progress value={(freeUsed / 3) * 100} className="h-1.5" />
        {freeUsed >= 3 && (
          <p className="mt-2 text-xs text-muted-foreground">
            You&apos;ve used all 3 free videos this month. Upgrade to Pro for unlimited access.
          </p>
        )}
      </div>

      {/* Runs list */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading your videos…
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-24 text-center">
          <FileText className="mb-4 h-10 w-10 text-muted-foreground/40" />
          <h3 className="font-medium">No videos yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Paste a YouTube URL to generate your first set of notes.</p>
          <Button onClick={() => setShowModal(true)} className="mt-6 gap-2" size="sm">
            <Plus className="h-4 w-4" />
            Add your first video
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const daysLeft = differenceInDays(new Date(run.expires_at), new Date());
            return (
              <div key={run.id} className="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/20 transition-colors">
                {run.thumbnail_url ? (
                  <img src={run.thumbnail_url} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded bg-muted">
                    <Video className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{run.title || run.url}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(run.duration_seconds)}
                    </span>
                    <span>{formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</span>
                    {run.status === "done" && daysLeft >= 0 && (
                      <span className={daysLeft <= 1 ? "text-red-500" : ""}>
                        expires in {daysLeft}d
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(run.status)}`}>
                    {run.status}
                  </span>
                  {run.status === "done" && (
                    <Link href={`/run/${run.id}`}>
                      <Button size="sm" variant="ghost" className="gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        Open <ChevronRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                  <button
                    onClick={() => handleDelete(run.id)}
                    className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New run modal */}
      <Dialog open={showModal} onOpenChange={(v) => { setShowModal(v); if (!v) { setLogs([]); setProgress(0); setRunError(null); setActiveRunId(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Process a new video</DialogTitle>
          </DialogHeader>

          {!activeRunId && progress < 100 ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">YouTube URL</label>
                <Input
                  placeholder="https://youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Free tier: videos up to 20 minutes.</p>
              </div>
              {runError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {runError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting} className="gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Starting…" : "Process video"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Processing…</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
              <div className="h-48 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground space-y-0.5">
                {logs.map((l, i) => <p key={i}>{l}</p>)}
                <div ref={logsEndRef} />
              </div>
              {progress === 100 && (
                <Button className="w-full" onClick={() => setShowModal(false)}>Done — view in dashboard</Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
