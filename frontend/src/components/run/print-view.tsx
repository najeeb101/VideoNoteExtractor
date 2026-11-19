"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Markdown } from "@/components/markdown";

const subscribe = () => () => {};

/** Print-only copy of the notes, mounted directly in <body>: the app shell is a
 *  fixed-height screen with inner scroll areas, so it can't be printed as-is.
 *  globals.css hides everything else when printing. */
export function PrintView({ title, url, markdown }: { title: string; url?: string; markdown: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <div className="print-root hidden print:block">
      <h1 className="mb-1 text-xl font-semibold">{title}</h1>
      {url && <p className="mb-6 text-xs">{url}</p>}
      <Markdown content={markdown} />
    </div>,
    document.body
  );
}
