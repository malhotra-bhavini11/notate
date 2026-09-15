"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { NoteGrid } from "@/components/note-card";
import { TagList } from "@/components/tag-list";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { tagHref } from "@/lib/paths";

const RECENT_LIMIT = 24;
const TAG_LIMIT = 30;

export default function DashboardPage() {
  // The index refreshes on tab focus and after creating notes, keeping this current.
  const { index, error, openNewNote } = useWorkspace();

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
      {!error && !index && <p className="text-sm text-muted-foreground">Loading…</p>}
      {index?.notes.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No notes yet. Create one to get started.
        </p>
      )}
      {index && index.notes.length > 0 && <NoteGrid notes={index.notes.slice(0, RECENT_LIMIT)} />}

      {index && index.tags.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Tags</h2>
            {index.tags.length > TAG_LIMIT && (
              <Link href={tagHref()} className="text-sm text-muted-foreground hover:underline">
                All {index.tags.length} tags
              </Link>
            )}
          </div>
          <TagList tags={index.tags.slice(0, TAG_LIMIT)} />
        </section>
      )}
    </div>
  );
}
