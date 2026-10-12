"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Download, Send, Loader2, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClient } from "@/lib/supabase/client";
import { api, type Notes, type ChatMessage } from "@/lib/api";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [notes, setNotes] = useState<Notes | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [tab, setTab] = useState("summary");
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  useEffect(() => {
    async function load() {
      const token = await getToken();
      try {
        const data = await api.runs.notes(token, id);
        setNotes(data);
      } catch {}
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    const token = await getToken();
    const res = await api.chat.send(token, id, [...messages, userMsg]);

    if (!res.body) { setStreaming(false); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantContent = "";

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const paint = () =>
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: assistantContent };
        return updated;
      });

    // The backend streams SSE frames: `data: {"token"|"error"|"done": ...}\n\n`
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        try {
          const obj = JSON.parse(line.slice(5).trim());
          if (obj.token) {
            assistantContent += obj.token;
            paint();
          } else if (obj.error) {
            assistantContent += `\n\n_[Error: ${obj.error}]_`;
            paint();
          }
        } catch {
          // ignore keep-alive / partial frames
        }
      }
    }
    setStreaming(false);
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadMd(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
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
        <Button variant="outline" size="sm" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  const tabContent =
    tab === "chunks" ? notes.chunk_notes_md
    : tab === "transcript" ? (notes.transcript_timestamped_txt || notes.transcript_txt)
    : notes.reduced_notes_md;
  const tabFile = ({ summary: "lectura-summary.md", chunks: "lectura-chunk-notes.md", transcript: "lectura-transcript.md" } as Record<string, string>)[tab] ?? "lectura-notes.md";

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-14 items-center gap-3 border-b border-border px-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Notes panel */}
        <div className="flex min-h-0 flex-1 flex-col border-b border-border lg:w-[55%] lg:flex-none lg:border-b-0 lg:border-r">
          <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4">
              <TabsList className="h-12 gap-1 bg-transparent p-0">
                <TabsTrigger value="summary" className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  Summary
                </TabsTrigger>
                <TabsTrigger value="chunks" className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  Chunk Notes
                </TabsTrigger>
                <TabsTrigger value="transcript" className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  Transcript
                </TabsTrigger>
              </TabsList>
              <div className="flex gap-1">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => copyText(tabContent)}
                  className="gap-1.5 text-muted-foreground"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => downloadMd(tabContent, tabFile)}
                  className="gap-1.5 text-muted-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <TabsContent value="summary" className="m-0 p-6">
                <Markdown content={notes.reduced_notes_md} />
              </TabsContent>
              <TabsContent value="chunks" className="m-0 p-6">
                <Markdown content={notes.chunk_notes_md} />
              </TabsContent>
              <TabsContent value="transcript" className="m-0 p-6">
                <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground leading-relaxed">
                  {notes.transcript_timestamped_txt || notes.transcript_txt}
                </pre>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>

        {/* Chat panel */}
        <div className="flex min-h-0 flex-1 flex-col lg:w-[45%] lg:flex-none">
          <div className="flex h-12 items-center border-b border-border px-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Chat with your notes</span>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
                <Bot className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Ask anything about the video</p>
                <div className="space-y-2">
                  {["Summarize the key points", "What are the main takeaways?", "Explain the most complex concept"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="block w-full rounded-md border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}>
                    {msg.role === "assistant" && (
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}>
                      {msg.content
                        ? (msg.role === "assistant" ? <Markdown content={msg.content} className="text-foreground" /> : <span className="whitespace-pre-wrap">{msg.content}</span>)
                        : (streaming && i === messages.length - 1 ? <span className="animate-pulse">▋</span> : "")}
                    </div>
                    {msg.role === "user" && (
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          <form onSubmit={sendMessage} className="border-t border-border p-4">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about the video…"
                className="min-h-[40px] max-h-32 resize-none text-sm"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e); }
                }}
              />
              <Button type="submit" size="icon" disabled={!input.trim() || streaming} className="shrink-0">
                {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
