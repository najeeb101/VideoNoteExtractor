import { Play } from "lucide-react";
import { formatClock, tsToSeconds, youtubeUrlAt } from "@/lib/youtube";

const CHIP = "inline-flex items-center gap-1 whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.7rem] text-primary transition-colors hover:bg-primary/20";

/** "HH:MM:SS" as a chip that plays the video from there (like the Markdown chips). */
export function TimeChip({
  ts, videoUrl, onSeek, label,
}: {
  ts: string;
  videoUrl?: string;
  onSeek?: (seconds: number) => void;
  label?: string;
}) {
  if (!ts) return null;
  const seconds = tsToSeconds(ts);
  const href = youtubeUrlAt(videoUrl, seconds);
  const content = (
    <>
      <Play className="h-2.5 w-2.5 fill-current" />
      {label ?? formatClock(seconds)}
    </>
  );
  if (!href) return <span className={CHIP}>{content}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onSeek && ((e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onSeek(seconds);
      })}
      className={CHIP}
    >
      {content}
    </a>
  );
}
