"use client";

import { Clock, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { noteHref, relativeTime } from "@/lib/paths";
import type { NoteSummary } from "@/lib/types";

export default function DashboardPage() {
  const { tree, openNewNote } = useWorkspace();
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch whenever the tree reloads (tab focus, new note) so ordering stays current.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/notes?limit=24", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        if (!cancelled) setNotes(json);
      })
      .catch((err) => !cancelled && setError(String(err.message ?? err)));
    return () => {
      cancelled = true;
    };
  }, [tree]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recently edited</h1>
          <p className="text-sm text-muted-foreground">Notes in your workspace, newest first.</p>
        </div>
        <Button onClick={() => openNewNote()}>
          <Plus />
          New note
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">Couldn&apos;t load notes: {error}</p>}
      {!error && notes === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {notes?.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No notes yet. Create one to get started.
        </p>
      )}

      {notes && notes.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <li key={note.path}>
              <Link
                href={noteHref(note.path)}
                className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/25 hover:bg-muted/40"
              >
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="line-clamp-2 font-medium leading-snug">{note.title}</span>
                </div>
                <span className="truncate font-mono text-xs text-muted-foreground">{note.path}</span>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                  {note.type && <Badge variant="secondary">{note.type}</Badge>}
                  {note.tags.slice(0, 4).map((tag) => (
                    <Badge key={tag} variant="outline">
                      #{tag}
                    </Badge>
                  ))}
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {relativeTime(note.mtime)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
