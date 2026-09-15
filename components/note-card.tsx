import { Clock, FileText } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { noteHref, relativeTime } from "@/lib/paths";
import type { NoteSummary } from "@/lib/types";

/** Title, path, type, tags, and last-edited time for a note in a grid. */
export function NoteCard({ note }: { note: NoteSummary }) {
  return (
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
  );
}

export function NoteGrid({ notes }: { notes: NoteSummary[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => (
        <li key={note.path}>
          <NoteCard note={note} />
        </li>
      ))}
    </ul>
  );
}
