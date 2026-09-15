"use client";

import { Hash } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { NoteGrid } from "@/components/note-card";
import { TagList } from "@/components/tag-list";
import { useWorkspace } from "@/components/workspace-provider";
import { tagMatches } from "@/lib/link-resolver";
import { tagHref } from "@/lib/paths";

/** Notes carrying a tag or any tag nested beneath it. */
export function TagView({ tag }: { tag: string }) {
  const { index } = useWorkspace();

  const { notes, children } = useMemo(() => {
    if (!index) return { notes: [], children: [] };
    return {
      notes: index.notes.filter((n) => n.tags.some((t) => tagMatches(t, tag))),
      children: index.tags.filter((t) => t.tag.startsWith(`${tag}/`)),
    };
  }, [index, tag]);

  const parents = tag.split("/").slice(0, -1);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav aria-label="Tag hierarchy" className="mb-1 text-sm text-muted-foreground">
        <Link href={tagHref()} className="hover:underline">
          Tags
        </Link>
        {parents.map((_, i) => {
          const parent = parents.slice(0, i + 1).join("/");
          return (
            <span key={parent}>
              {" / "}
              <Link href={tagHref(parent)} className="hover:underline">
                {parents[i]}
              </Link>
            </span>
          );
        })}
      </nav>
      <h1 className="mb-6 flex items-center gap-1 text-2xl font-semibold tracking-tight">
        <Hash className="size-6 text-muted-foreground" />
        {tag}
      </h1>

      {children.length > 0 && <TagList tags={children} className="mb-6" />}

      {!index && <p className="text-sm text-muted-foreground">Loading…</p>}
      {index && notes.length === 0 && <p className="text-sm text-muted-foreground">No notes have this tag.</p>}
      {notes.length > 0 && <NoteGrid notes={notes} />}
    </div>
  );
}
