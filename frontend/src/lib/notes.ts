import { tsToSeconds } from "@/lib/youtube";

// The pipeline's chunk notes title each section with its chunk file and time
// range: "## chunk_0.txt [00:00:00 - 00:02:39]".
const TS = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
const PART_RE = new RegExp(String.raw`^#+\s+chunk_(\d+)\.txt\s*\[(${TS})\s*[-‐‑‒–—]\s*(${TS})\]`, "gm");

export interface Part {
  index: number;
  start: number;
  end: number;
}

/** Time-ordered sections of the chunk notes (the video's natural chapters). */
export function parseParts(chunkMd: string | undefined): Part[] {
  if (!chunkMd) return [];
  return [...chunkMd.matchAll(PART_RE)]
    .map((m) => ({ index: Number(m[1]), start: tsToSeconds(m[2]), end: tsToSeconds(m[3]) }))
    .sort((a, b) => a.start - b.start);
}

const BULLET_RE = /^\s*[-*+•]\s+(.*)$/;

/** Stable short key for a bullet's text: what a star is stored as. */
export function bulletKey(text: string): string {
  let h = 5381;
  for (const ch of text.trim()) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return h.toString(36);
}

/** The starred bullets from `sources`, in order and de-duplicated, as markdown. */
export function starredMarkdown(sources: string[], starred: Set<string>): string {
  const lines = new Set<string>();
  for (const md of sources) {
    for (const line of md.split("\n")) {
      const m = line.replace(/\s+$/, "").match(BULLET_RE);
      if (m && starred.has(bulletKey(m[1]))) lines.add(`- ${m[1].trim()}`);
    }
  }
  return [...lines].join("\n");
}

/** Chunk notes for display: no redundant "# Chunk Notes" title, and each
 *  "## chunk_N.txt" heading becomes its chapter title (or "Part N+1"). */
export function readableChunkNotes(md: string, titles?: Record<number, string>) {
  return md
    .replace(/^#\s+Chunk Notes\s*$/m, "")
    .replace(/^(#+)\s+chunk_(\d+)\.txt\b/gm, (_, hashes: string, n: string) =>
      `${hashes} ${titles?.[Number(n)] ?? `Part ${Number(n) + 1}`}`
    );
}
