"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { createClient } from "@/lib/supabase/client";
import { api, type ChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Summarize the key points", "What are the main takeaways?", "Explain the most complex concept"];

export interface ChatHandle {
  /** Pre-fill the input with `text` and focus it. */
  ask(text: string): void;
}

export function ChatPanel({
  runId, videoUrl, onSeek, className, ref,
}: {
  runId: string;
  videoUrl?: string;
  onSeek?: (seconds: number) => void;
  className?: string;
  ref?: Ref<ChatHandle>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const supabase = createClient();

  useImperativeHandle(ref, () => ({
    ask(text: string) {
      setInput(text);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        el?.focus();
        el?.setSelectionRange(text.length, text.length);
      });
    },
  }), []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    let assistantContent = "";
    const paint = () =>
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: assistantContent };
        return updated;
      });

    try {
      const { data } = await supabase.auth.getSession();
      const res = await api.chat.send(data.session?.access_token ?? "", runId, history);
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
              assistantContent += `\n\n*Error: ${obj.error}*`;
              paint();
            }
          } catch {
            // ignore keep-alive / partial frames
          }
        }
      }
    } catch (err) {
      assistantContent += `${assistantContent ? "\n\n" : ""}*Couldn't get an answer: ${err instanceof Error ? err.message : "network error"}*`;
      paint();
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Chat with your notes</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Ask anything about the video</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
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
                    "min-w-0 max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  )}>
                    {msg.content
                      ? (msg.role === "assistant"
                          ? <Markdown content={msg.content} videoUrl={videoUrl} onSeek={onSeek} className="text-foreground" />
                          : <span className="whitespace-pre-wrap break-words">{msg.content}</span>)
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
        </div>
      </ScrollArea>

      <form onSubmit={sendMessage} className="shrink-0 border-t border-border p-3">
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the video…"
            className="min-h-[40px] max-h-32 resize-none text-sm"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e); }
            }}
          />
          <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim() || streaming} className="shrink-0">
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}
