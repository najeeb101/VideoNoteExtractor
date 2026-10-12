import { Fragment } from "react";
import { cn } from "@/lib/utils";

// Minimal Markdown renderer for pipeline notes and chat replies: headings,
// (nested) bullets, numbered items, and inline **bold**, *italic*, `code`,
// plus [HH:MM:SS] timestamps rendered as chips. No dependency needed.

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[\d{1,2}:\d{2}(?::\d{2})?\])/g;

function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE_RE).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
          return <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">{part.slice(1, -1)}</code>;
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
          return <em key={i}>{part.slice(1, -1)}</em>;
        if (/^\[\d{1,2}:\d{2}(?::\d{2})?\]$/.test(part))
          return (
            <span key={i} className="ml-1 whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 align-middle font-mono text-[0.7rem] text-primary">
              {part.slice(1, -1)}
            </span>
          );
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = content.split("\n");
  return (
    <div className={cn("space-y-1.5 text-sm leading-relaxed text-muted-foreground", className)}>
      {lines.map((raw, i) => {
        const line = raw.replace(/\s+$/, "");
        if (line.trim() === "" || /^-{3,}$/.test(line.trim())) return null;

        const heading = line.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
          const level = heading[1].length;
          return (
            <h3
              key={i}
              className={cn(
                "font-semibold tracking-tight text-foreground",
                level <= 1 ? "pt-2 text-lg" : level === 2 ? "pt-5 text-base" : "pt-3 text-sm"
              )}
            >
              <Inline text={heading[2]} />
            </h3>
          );
        }

        const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
        if (bullet) {
          const depth = Math.min(Math.floor(bullet[1].length / 2), 3);
          return (
            <div key={i} className="flex gap-2.5" style={{ paddingLeft: depth * 16 }}>
              <span className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
              <p className="min-w-0"><Inline text={bullet[2]} /></p>
            </div>
          );
        }

        const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (numbered) {
          return (
            <div key={i} className="flex gap-2.5">
              <span className="w-4 shrink-0 text-right font-mono text-xs leading-6 text-primary/80">{numbered[1]}.</span>
              <p className="min-w-0"><Inline text={numbered[2]} /></p>
            </div>
          );
        }

        return <p key={i}><Inline text={line} /></p>;
      })}
    </div>
  );
}
