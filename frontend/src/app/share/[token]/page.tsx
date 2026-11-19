import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedNotesView } from "@/components/run/shared-notes-view";
import { api } from "@/lib/api";

// Public page: no login. One backend request per render, shared by the
// metadata and the page body.
const getShared = cache((token: string) => api.shared(token).catch(() => null));

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shared = await getShared((await params).token);
  if (!shared) return { title: "Notes not found — Lectura" };
  const description = shared.study?.tldr ?? "Timestamped study notes made with Lectura.";
  return {
    title: `${shared.title} — notes | Lectura`,
    description,
    openGraph: { title: `${shared.title} — notes`, description, siteName: "Lectura" },
  };
}

export default async function SharePage({ params }: Props) {
  const shared = await getShared((await params).token);
  if (!shared) notFound();
  return <SharedNotesView shared={shared} />;
}
