"use client";

import Link from "next/link";
import { BookOpen, Video, Sparkles, MessageSquare, Download, Clock, Check, ChevronRight, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";

export default function LandingPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
            <BookOpen className="h-5 w-5 text-primary" />
            <span>Lectura</span>
          </Link>
          <nav className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </button>
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/login">
              <Button size="sm">Get started free</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <Badge variant="secondary" className="mb-6">
          <Sparkles className="mr-1.5 h-3 w-3" />
          Powered by Gemini AI + Whisper
        </Badge>
        <h1 className="mb-6 text-5xl font-semibold tracking-tight sm:text-6xl">
          Turn any video into
          <br />
          <span className="text-primary">structured notes</span>
        </h1>
        <p className="mx-auto mb-10 max-w-xl text-lg text-muted-foreground">
          Paste a YouTube URL. Lectura transcribes, summarizes, and organizes the content into
          clean, timestamped study notes — then lets you chat with them.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/login">
            <Button size="lg" className="gap-2">
              Start for free <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="#how-it-works">
            <Button variant="outline" size="lg">See how it works</Button>
          </Link>
        </div>

        {/* Product mockup */}
        <div className="mt-16 overflow-hidden rounded-lg border border-border bg-card shadow-sm text-left">
          <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-red-400/70" />
            <div className="h-3 w-3 rounded-full bg-yellow-400/70" />
            <div className="h-3 w-3 rounded-full bg-green-400/70" />
            <span className="ml-2 text-xs text-muted-foreground">lectura.app/dashboard</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border">
            <div className="col-span-1 bg-sidebar p-4 space-y-1">
              <div className="flex items-center gap-2 rounded-md bg-sidebar-accent px-3 py-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Dashboard</span>
              </div>
              {["MIT Lecture 3.1", "Python Crash Course", "System Design 101"].map((t) => (
                <div key={t} className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground">
                  <Video className="h-4 w-4" />
                  <span className="text-sm truncate">{t}</span>
                </div>
              ))}
            </div>
            <div className="col-span-2 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">MIT Lecture 3.1 — Binary Search Trees</h3>
                <Badge variant="secondary" className="text-xs">Done</Badge>
              </div>
              <div className="space-y-2">
                {[
                  "Introduction to BST properties and invariants",
                  "Insertion: O(log n) average case",
                  "Deletion: 3 cases — leaf, one child, two children",
                  "Traversal: inorder yields sorted sequence",
                ].map((line) => (
                  <div key={line} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {line}
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  💬 <span className="font-medium text-foreground">Chat with your notes</span>
                  {" — \"What's the time complexity of BST deletion?\""}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-border bg-muted/30 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Three steps to better notes</h2>
            <p className="mt-3 text-muted-foreground">From raw video to structured knowledge in minutes.</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              { step: "01", icon: Video, title: "Paste a URL", desc: "Drop in any YouTube video — lectures, tutorials, conference talks, podcasts." },
              { step: "02", icon: Sparkles, title: "AI processes it", desc: "Whisper transcribes the audio. Gemini summarizes each section and builds a structured outline." },
              { step: "03", icon: MessageSquare, title: "Read and chat", desc: "Browse timestamped notes, export to Markdown, or ask questions about the content." },
            ].map(({ step, icon: Icon, title, desc }) => (

              <div key={step} className="rounded-lg border border-border bg-card p-6">
                <span className="mb-4 block text-4xl font-bold text-border">{step}</span>
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Everything you need to learn faster</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Clock, title: "Timestamped notes", desc: "Every section links back to the exact moment in the video." },
              { icon: Sparkles, title: "AI summarization", desc: "Chunk-by-chunk summaries plus a consolidated outline of the whole video." },
              { icon: MessageSquare, title: "RAG-powered chat", desc: "Ask questions and get answers grounded in the actual video content." },
              { icon: Download, title: "Markdown export", desc: "Download your notes as clean Markdown, ready for Obsidian or Notion." },
              { icon: BookOpen, title: "Full transcript", desc: "Access the raw transcript alongside the AI-generated notes." },
              { icon: Video, title: "YouTube support", desc: "Works with any YouTube video up to 20 minutes on the free tier." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-lg border border-border bg-card p-5 hover:border-primary/30 transition-colors">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="mb-1 text-sm font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-border bg-muted/30 py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Simple, honest pricing</h2>
            <p className="mt-3 text-muted-foreground">Start for free. Upgrade when you need more.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-8">
              <h3 className="text-lg font-semibold">Free</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="mt-2 mb-6 text-sm text-muted-foreground">Perfect for trying it out.</p>
              <ul className="mb-8 space-y-3">
                {["3 videos per month", "Up to 20 min per video", "Notes deleted after 7 days", "Markdown export", "RAG chat"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-primary" />{f}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block">
                <Button variant="outline" className="w-full">Get started free</Button>
              </Link>
            </div>
            <div className="relative rounded-lg border-2 border-primary bg-card p-8">
              <Badge className="absolute -top-3 right-6">Coming soon</Badge>
              <h3 className="text-lg font-semibold">Pro</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-bold">$9</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="mt-2 mb-6 text-sm text-muted-foreground">For serious learners.</p>
              <ul className="mb-8 space-y-3">
                {["Unlimited videos", "Up to 2 hours per video", "Notes kept forever", "Public share links", "Priority processing", "Everything in Free"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-primary" />{f}
                  </li>
                ))}
              </ul>
              <Button className="w-full" disabled>Coming soon</Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 text-center">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Ready to learn smarter?</h2>
          <p className="mt-4 text-muted-foreground">
            Join students and professionals who turn hours of video into minutes of reading.
          </p>
          <Link href="/login" className="mt-8 inline-block">
            <Button size="lg" className="gap-2">
              Start for free <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Lectura</span>
            <span>· Built by Najeeb Abdi</span>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Lectura</p>
        </div>
      </footer>
    </div>
  );
}
