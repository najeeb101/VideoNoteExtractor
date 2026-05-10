const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "API error");
  }
  return res.json() as Promise<T>;
}

export type RunStatus = "queued" | "processing" | "done" | "failed";

export interface Run {
  id: string;
  title: string;
  url: string;
  status: RunStatus;
  duration_seconds: number | null;
  created_at: string;
  expires_at: string;
  thumbnail_url?: string;
}

export interface Notes {
  chunk_notes_md: string;
  reduced_notes_md: string;
  transcript_txt: string;
  transcript_timestamped_txt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const api = {
  runs: {
    list: (token: string) => apiFetch<Run[]>("/api/runs", token),
    create: (token: string, url: string) =>
      apiFetch<{ run_id: string }>("/api/run", token, {
        method: "POST",
        body: JSON.stringify({ url }),
      }),
    notes: (token: string, runId: string) =>
      apiFetch<Notes>(`/api/notes/${runId}`, token),
    delete: (token: string, runId: string) =>
      apiFetch<void>(`/api/runs/${runId}`, token, { method: "DELETE" }),
  },
  chat: {
    send: (token: string, runId: string, messages: ChatMessage[]) =>
      fetch(`${API_BASE}/api/chat/${runId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages }),
      }),
  },
  stream: (runId: string, token: string) =>
    new EventSource(`${API_BASE}/api/stream/${runId}?token=${token}`),
};
