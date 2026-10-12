import { Fragment, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { tsToSeconds, youtubeUrlAt } from "@/lib/youtube";

// Minimal Markdown renderer for pipeline notes and chat replies: headings,
// (nested) bullets, numbered items, tables, code blocks, quotes, and inline
// **bold**, *italic*, `code`, <br>, plus [HH:MM:SS] timestamps rendered as chips
// (linking into the video when `videoUrl` is given; `onSeek` makes a plain click
// play the embedded player instead). No dependency needed.

interface Options {
  videoUrl?: string;
  onSeek?: (seconds: number) => void;
}

// A timestamp is [HH:MM:SS] or a range like [00:00:00 - 00:02:39].
const TS = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
const INLINE_RE = new RegExp(String.raw`(\*\*[^*]+\*\*|\x60[^\x60]+\x60|\*[^*\s][^*]*\*|\[${TS}(?:\s*[-‐‑‒–—]\s*${TS})?\]|<br\s*\/?>)`, "gi");
const TIMESTAMP_RE = new RegExp(String.raw`^\[(${TS})(?:\s*[-‐‑‒–—]\s*(${TS}))?\]$`);
const BR_RE = /^<br\s*\/?>$/i;
const TABLE_SEP_RE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
// "( [00:00:42] )", "( [a]–[b] )" or "(earliest timestamp [a])" -> just the timestamp(s)
const PAREN_TS_RE = new RegExp(
  String.raw`\(\s*(?:earliest\s+timestamp\s*)?((?:\[${TS}(?:\s*[-‐‑‒–—]\s*${TS})?\]\s*[-‐‑‒–—,]?\s*)+)\)`,
  "gi"
);

const CHIP = "ml-1 whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 align-middle font-mono text-[0.7rem] text-primary";

function Inline({ text, opts }: { text: string; opts: Options }) {
  const parts = text.replace(PAREN_TS_RE, (_, ts: string) => ts.trim()).split(INLINE_RE).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
          return <strong key={i} className="font-semibold text-foreground"><Inline text={part.slice(2, -2)} opts={opts} /></strong>;
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
          return <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">{part.slice(1, -1)}</code>;
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
          return <em key={i}>{part.slice(1, -1)}</em>;
        if (BR_RE.test(part)) return <br key={i} />;
        const ts = part.match(TIMESTAMP_RE);
        if (ts) {
          const label = ts[2] ? `${ts[1]}–${ts[2]}` : ts[1];
          const seconds = tsToSeconds(ts[1]);
          const href = youtubeUrlAt(opts.videoUrl, seconds);
          const { onSeek } = opts;
          return href ? (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={onSeek ? "Play from here" : "Open the video at this moment"}
              onClick={onSeek && ((e) => {
                // Modified clicks still open YouTube in a new tab.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                onSeek(seconds);
              })}
              className={cn(CHIP, "transition-colors hover:bg-primary/20")}
            >
              {label}
            </a>
          ) : (
            <span key={i} className={CHIP}>{label}</span>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function splitRow(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

// Heading text without markdown or timestamps, for the "Ask" prompt.
function plainHeading(text: string) {
  return text.replace(INLINE_RE, (m) => (TIMESTAMP_RE.test(m) ? "" : m.replace(/[*`]/g, ""))).trim();
}

export function Markdown({
  content, className, videoUrl, onSeek, onAskHeading,
}: {
  content: string;
  className?: string;
  videoUrl?: string;
  onSeek?: (seconds: number) => void;
  /** Adds an "Ask" button to each heading. */
  onAskHeading?: (heading: string) => void;
}) {
  const lines = content.split("\n").map((l) => l.replace(/\s+$/, ""));
  const blocks: ReactNode[] = [];
  const opts: Options = { videoUrl, onSeek };
  const inline = (text: string) => <Inline text={text} opts={opts} />;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) continue;

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i]);
      blocks.push(
        <pre key={i} className="my-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
          {code.join("\n")}
        </pre>
      );
      continue;
    }

    // Table: consecutive lines starting with "|", optionally with a header separator
    if (trimmed.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++].trim());
      i--;
      const hasHeader = rows.length > 1 && TABLE_SEP_RE.test(rows[1]);
      const header = hasHeader ? splitRow(rows[0]) : null;
      const body = (hasHeader ? rows.slice(2) : rows).filter((r) => !TABLE_SEP_RE.test(r)).map(splitRow);
      blocks.push(
        <div key={i} className="my-2 overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-left text-sm">
            {header && (
              <thead className="bg-muted/50">
                <tr>
                  {header.map((cell, c) => (
                    <th key={c} className="px-3 py-2 align-top font-semibold text-foreground">{inline(cell)}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className={cn((header || r > 0) && "border-t border-border")}>
                  {row.map((cell, c) => (
                    <td key={c} className="min-w-[8rem] px-3 py-2 align-top">{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <h3
          key={i}
          className={cn(
            "group font-semibold tracking-tight text-foreground",
            level <= 1 ? "pt-2 text-lg" : level === 2 ? "pt-5 text-base" : "pt-3 text-sm"
          )}
        >
          {inline(heading[2])}
          {onAskHeading && (
            <button
              type="button"
              onClick={() => onAskHeading(plainHeading(heading[2]))}
              className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 align-middle text-xs font-normal text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 print:hidden"
            >
              <MessageSquare className="h-3 w-3" /> Ask
            </button>
          )}
        </h3>
      );
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      blocks.push(
        <blockquote key={i} className="border-l-2 border-primary/40 pl-3 italic">{inline(quote[1])}</blockquote>
      );
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+•]\s+(.*)$/);
    if (bullet) {
      const depth = Math.min(Math.floor(bullet[1].length / 2), 3);
      blocks.push(
        <div key={i} className="flex gap-2.5" style={{ paddingLeft: depth * 16 }}>
          <span className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
          <p className="min-w-0">{inline(bullet[2])}</p>
        </div>
      );
      continue;
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      blocks.push(
        <div key={i} className="flex gap-2.5">
          <span className="w-4 shrink-0 text-right font-mono text-xs leading-6 text-primary/80">{numbered[1]}.</span>
          <p className="min-w-0">{inline(numbered[2])}</p>
        </div>
      );
      continue;
    }

    blocks.push(<p key={i}>{inline(line)}</p>);
  }

  return (
    <div className={cn("space-y-1.5 text-sm leading-relaxed text-muted-foreground", className)}>
      {blocks}
    </div>
  );
}
