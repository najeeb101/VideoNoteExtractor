"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy, Download, FileText, Printer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "lectura-notes";
}

function download(content: string, filename: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

/** Export actions for the notes currently on screen. */
export function ExportMenu({
  title, markdown, viewName, transcript,
}: {
  title: string;
  /** Markdown of the view the user is reading. */
  markdown: string;
  /** "summary" or "detailed"; goes into the filename. */
  viewName: string;
  transcript?: string;
}) {
  const [copied, setCopied] = useState(false);
  const base = slug(title);

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-muted-foreground")}>
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Download className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{copied ? "Copied" : "Export"}</span>
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={copy}>
          <Copy /> Copy as Markdown
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => download(markdown, `${base}-${viewName}.md`, "text/markdown")}>
          <Download /> Download .md
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.print()}>
          <Printer /> Print / Save as PDF
        </DropdownMenuItem>
        {transcript && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => download(transcript, `${base}-transcript.txt`, "text/plain")}>
              <FileText /> Download transcript
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
