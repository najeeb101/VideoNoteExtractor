"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { cn } from "@/lib/utils";

// The slice of the YouTube IFrame Player API we use (no @types dependency).
interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const PLAYING = 1;
let apiReady: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiReady ??= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });
  return apiReady;
}

export interface YouTubePlayerHandle {
  /** Jump to `seconds` and play. Queued until the player is ready. */
  seekTo(seconds: number): void;
}

export function YouTubePlayer({
  videoId, onTime, className, ref,
}: {
  videoId: string;
  /** Called about once a second with the playback position while playing. */
  onTime?: (seconds: number) => void;
  className?: string;
  ref?: Ref<YouTubePlayerHandle>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const pendingSeek = useRef<number | null>(null);
  const onTimeRef = useRef(onTime);

  useEffect(() => {
    onTimeRef.current = onTime;
  });

  useImperativeHandle(ref, () => ({
    seekTo(seconds: number) {
      const player = playerRef.current;
      if (!player || !readyRef.current) {
        pendingSeek.current = seconds;
        return;
      }
      player.seekTo(seconds, true);
      player.playVideo();
      onTimeRef.current?.(seconds);
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      // The API replaces this element with its iframe, so give it a child of
      // its own rather than the node React manages.
      const mount = document.createElement("div");
      hostRef.current.appendChild(mount);
      playerRef.current = new YT.Player(mount, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            if (pendingSeek.current != null) {
              playerRef.current?.seekTo(pendingSeek.current, true);
              playerRef.current?.playVideo();
              pendingSeek.current = null;
            }
          },
        },
      });
      timer = window.setInterval(() => {
        const player = playerRef.current;
        if (readyRef.current && player?.getPlayerState() === PLAYING) {
          onTimeRef.current?.(player.getCurrentTime());
        }
      }, 1000);
    });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
    };
  }, [videoId]);

  return (
    <div
      ref={hostRef}
      className={cn("aspect-video w-full overflow-hidden bg-black [&_iframe]:h-full [&_iframe]:w-full", className)}
    />
  );
}
