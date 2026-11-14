// Helpers for embedding the source video and deep-linking into it.

const ID_RE = /^[\w-]{11}$/;

/** The 11-char video id from any common YouTube URL shape, else null. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    let id: string | null = null;
    if (host === "youtu.be") {
      id = u.pathname.slice(1).split("/")[0];
    } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/?#]+)/)?.[1] ?? null;
    }
    return id && ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** "HH:MM:SS" or "MM:SS" -> seconds. */
export function tsToSeconds(ts: string): number {
  return ts.split(":").reduce((acc, n) => acc * 60 + Number(n), 0);
}

/** Seconds -> "m:ss" (or "h:mm:ss" past an hour). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** A youtube.com link that starts playback at `seconds`; null for non-YouTube URLs. */
export function youtubeUrlAt(url: string | null | undefined, seconds: number): string | null {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}&t=${Math.floor(seconds)}s` : null;
}
