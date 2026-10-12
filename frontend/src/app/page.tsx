import Link from "next/link";
import {
  BookOpen, Sparkles, MessageSquare, Download, Clock, Check, ChevronRight,
  FileText, ArrowRight, Link2, Cpu,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeroUrlForm } from "@/components/hero-url-form";
import { cn } from "@/lib/utils";

const SAMPLE_NOTES = [
  { t: "00:00:06", text: "Edward Jenner injected cowpox into a boy in 1796, producing the first successful **vaccine**." },
  { t: "00:01:10", text: "**Adaptive immunity**: B-cells and T-cells identify pathogens and keep a memory of them." },
  { t: "00:02:56", text: "**Inactive vaccines** use killed pathogens but give shorter-lasting protection." },
  { t: "00:03:27", text: "**DNA vaccines** use isolated genes to make cells produce a specific antigen." },
];

const STEPS = [
  { icon: Link2, title: "Paste a URL", desc: "Any YouTube lecture, tutorial or talk up to 20 minutes." },
  { icon: Cpu, title: "We process it", desc: "Whisper transcribes the audio; an LLM summarizes each section and merges them into one outline." },
  { icon: MessageSquare, title: "Read and chat", desc: "Browse timestamped notes, export Markdown, or ask questions." },
];

function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith("**") ? <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong> : p
      )}
    </>
  );
}

function Chip({ t }: { t: string }) {
  return (
    <span className="ml-1.5 whitespace-nowrap rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[0.7rem] text-primary ring-1 ring-inset ring-primary/20">
      {t}
    </span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-primary">{children}</p>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground selection:bg-primary/20">
      {/* Floating nav */}
      <header className="sticky top-3 z-50 px-3 sm:px-6">
        <div className="glass mx-auto flex h-12 max-w-5xl items-center justify-between rounded-full border border-border/70 pl-4 pr-2 shadow-sm">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookOpen className="h-3.5 w-3.5" />
            </span>
            Lectura
          </Link>
          <nav className="flex items-center gap-1">
            <a href="#how-it-works" className="hidden rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block">How it works</a>
            <a href="#features" className="hidden rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block">Features</a>
            <a href="#pricing" className="hidden rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block">Pricing</a>
            <ThemeToggle />
            <Link href="/login" className={cn(buttonVariants({ size: "sm" }), "rounded-full px-4")}>Sign in</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[40rem]" />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[34rem] w-[60rem] max-w-full -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-20 text-center sm:px-6 sm:pt-28">
          <a
            href="#how-it-works"
            style={{ "--delay": "0ms" } as React.CSSProperties}
            className="animate-fade-up group mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 py-1 pl-1 pr-3 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            <span className="rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground">New</span>
            Chat with any video&apos;s notes
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </a>

          <h1
            style={{ "--delay": "80ms" } as React.CSSProperties}
            className="animate-fade-up mx-auto max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl"
          >
            <span className="text-gradient">Turn any video into</span>
            <br />
            <span className="text-gradient-primary">structured notes</span>
          </h1>

          <p
            style={{ "--delay": "160ms" } as React.CSSProperties}
            className="animate-fade-up mx-auto mt-6 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg"
          >
            Paste a YouTube link. Get clean, timestamped study notes in minutes — then ask your notes questions.
          </p>

          <div style={{ "--delay": "240ms" } as React.CSSProperties} className="animate-fade-up mt-9">
            <HeroUrlForm />
          </div>
          <p
            style={{ "--delay": "300ms" } as React.CSSProperties}
            className="animate-fade-up mt-4 text-xs text-muted-foreground"
          >
            Free: 3 videos a month, up to 20 minutes each. No card needed.
          </p>

          {/* Product mockup */}
          <div style={{ "--delay": "420ms" } as React.CSSProperties} className="animate-fade-up relative mx-auto mt-20 max-w-4xl">
            <div aria-hidden className="absolute -inset-x-6 -inset-y-6 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_40%,color-mix(in_oklab,var(--primary)_25%,transparent),transparent_70%)] blur-2xl" />
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card text-left shadow-2xl shadow-primary/10 ring-1 ring-foreground/5">
              <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                <span className="ml-3 truncate rounded-md bg-background/60 px-3 py-0.5 text-xs text-muted-foreground">Lectura · How do vaccines work?</span>
              </div>
              <div className="grid md:grid-cols-[1.4fr_1fr] md:divide-x md:divide-border">
                <div className="space-y-3.5 p-5 sm:p-7">
                  <div className="flex items-center gap-5 border-b border-border pb-3 text-sm">
                    <span className="-mb-[13px] border-b-2 border-primary pb-3 font-medium">Summary</span>
                    <span className="text-muted-foreground">Chunk Notes</span>
                    <span className="text-muted-foreground">Transcript</span>
                  </div>
                  {SAMPLE_NOTES.map((n) => (
                    <div key={n.t} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                      <p><Bold text={n.text} /><Chip t={n.t} /></p>
                    </div>
                  ))}
                </div>
                <div className="space-y-3 border-t border-border bg-muted/20 p-5 sm:p-7 md:border-t-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <MessageSquare className="h-4 w-4 text-primary" /> Chat with your notes
                  </p>
                  <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                    How is a DNA vaccine different?
                  </div>
                  <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm">
                    It uses only the genes that code for an antigen, so your own cells make it — no part of the pathogen is injected.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-14 text-center">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="text-gradient text-3xl font-semibold tracking-tight sm:text-5xl">Three steps. A few minutes.</h2>
          </div>
          <div className="relative grid gap-5 sm:grid-cols-3">
            <div aria-hidden className="absolute left-[16%] right-[16%] top-[3.1rem] hidden h-px bg-gradient-to-r from-transparent via-border to-transparent sm:block" />
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <div key={title} className="relative rounded-2xl border border-border bg-card/60 p-6 backdrop-blur transition-colors hover:border-primary/30">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-inset ring-primary/20">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="mb-1 font-mono text-xs text-muted-foreground">STEP 0{i + 1}</p>
                <h3 className="mb-2 text-lg font-semibold tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — bento */}
      <section id="features" className="scroll-mt-20 border-t border-border bg-muted/20 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-14 text-center">
            <Eyebrow>Features</Eyebrow>
            <h2 className="text-gradient text-3xl font-semibold tracking-tight sm:text-5xl">Everything to learn faster</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-6">
            <BentoCard className="md:col-span-4" icon={Clock} title="Timestamped notes" desc="Every bullet is tagged with the moment in the video it came from.">
              <div className="mt-6 space-y-2.5 rounded-xl border border-border bg-background/60 p-4">
                {SAMPLE_NOTES.slice(0, 3).map((n) => (
                  <p key={n.t} className="text-sm leading-relaxed text-muted-foreground"><Bold text={n.text} /><Chip t={n.t} /></p>
                ))}
              </div>
            </BentoCard>
            <BentoCard className="md:col-span-2" icon={Sparkles} title="Two levels of summary" desc="Section-by-section notes, plus one consolidated outline.">
              <div className="mt-6 space-y-2">
                {["Origins of Vaccines", "Immune System Response", "Vaccine Types"].map((h, i) => (
                  <div key={h} className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-primary">0{i + 1}</span>{h}
                  </div>
                ))}
              </div>
            </BentoCard>
            <BentoCard className="md:col-span-2" icon={MessageSquare} title="Chat with your notes" desc="Answers grounded in the video's own notes and outline.">
              <div className="mt-6 space-y-2 text-sm">
                <div className="ml-auto w-fit rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-primary-foreground">What is AIMD?</div>
                <div className="w-fit max-w-full rounded-2xl rounded-bl-sm bg-muted px-3 py-1.5 text-muted-foreground">Additive increase, multiplicative decrease…</div>
              </div>
            </BentoCard>
            <BentoCard className="md:col-span-2" icon={Download} title="Markdown export" desc="Ready for Obsidian or Notion.">
              <pre className="mt-6 overflow-hidden rounded-xl border border-border bg-background/60 p-3 font-mono text-xs leading-relaxed text-muted-foreground">{`## Vaccine Types\n- **Subunit** vaccines use\n  only the antigen [00:03:03]`}</pre>
            </BentoCard>
            <BentoCard className="md:col-span-2" icon={FileText} title="Full transcript" desc="Read the raw timestamped transcript next to your notes.">
              <pre className="mt-6 overflow-hidden rounded-xl border border-border bg-background/60 p-3 font-mono text-xs leading-relaxed text-muted-foreground">{`[00:00:06] In 1796, the scientist\n[00:00:14] Edward Jenner injected…`}</pre>
            </BentoCard>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="mb-14 text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="text-gradient text-3xl font-semibold tracking-tight sm:text-5xl">Simple pricing</h2>
            <p className="mt-4 text-muted-foreground">Start free. Pro is on the way.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <PlanCard
              name="Free" price="$0" blurb="Perfect for trying it out."
              features={["3 videos per month", "Up to 20 min per video", "Notes kept for 7 days", "Markdown export", "Chat with your notes"]}
              action={<Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full rounded-full")}>Get started free</Link>}
            />
            <PlanCard
              name="Pro" price="$9" blurb="For serious learners." highlight
              features={["Unlimited videos", "Up to 2 hours per video", "Notes kept forever", "Public share links", "Priority processing", "Everything in Free"]}
              action={<span className={cn(buttonVariants(), "pointer-events-none h-10 w-full rounded-full opacity-50")}>Coming soon</span>}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24 sm:px-6 sm:pb-32">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-border bg-card px-6 py-16 text-center sm:py-20">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_120%,color-mix(in_oklab,var(--primary)_28%,transparent),transparent_70%)]" />
          <div aria-hidden className="bg-grid absolute inset-0 opacity-60" />
          <div className="relative">
            <h2 className="text-gradient text-3xl font-semibold tracking-tight sm:text-5xl">Stop rewatching.<br />Start reviewing.</h2>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">Turn an hour of video into a few minutes of reading.</p>
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "mt-8 h-11 gap-2 rounded-full px-7")}>
              Start for free <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-foreground">
              <BookOpen className="h-3 w-3" />
            </span>
            <span className="font-medium text-foreground">Lectura</span>
            <span>· Built by Najeeb Abdi</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
            <Link href="/login" className="transition-colors hover:text-foreground">Sign in</Link>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BentoCard({
  icon: Icon, title, desc, children, className,
}: {
  icon: React.ComponentType<{ className?: string }>; title: string; desc: string; children?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("group relative overflow-hidden rounded-2xl border border-border bg-card/70 p-6 backdrop-blur transition-colors hover:border-primary/30", className)}>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h3 className="mb-1 font-semibold tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground">{desc}</p>
        {children}
      </div>
    </div>
  );
}

function PlanCard({
  name, price, blurb, features, action, highlight,
}: {
  name: string; price: string; blurb: string; features: string[]; action: React.ReactNode; highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl p-8",
        highlight
          ? "border border-primary/50 bg-card shadow-xl shadow-primary/10 ring-1 ring-primary/20"
          : "border border-border bg-card/60 backdrop-blur"
      )}
    >
      {highlight && (
        <span className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">Coming soon</span>
      )}
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-5xl font-semibold tracking-tight">{price}</span>
        <span className="text-muted-foreground">/month</span>
      </div>
      <p className="mb-7 mt-2 text-sm text-muted-foreground">{blurb}</p>
      <ul className="mb-8 flex-1 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2.5 text-sm">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Check className="h-2.5 w-2.5 text-primary" />
            </span>
            {f}
          </li>
        ))}
      </ul>
      {action}
    </div>
  );
}
