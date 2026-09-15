"use client";

import { Link2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

import { useNoteLinks } from "@/components/use-note-links";
import { useWorkspace } from "@/components/workspace-provider";
import { tokenize } from "@/lib/markdown-tokens";
import { backlinksApiUrl } from "@/lib/paths";
import type { BacklinkDTO } from "@/lib/types";

type State = { kind: "loading" } | { kind: "ready"; backlinks: BacklinkDTO[] } | { kind: "error"; message: string };

/** "Linked from" list at the foot of a note: every note whose [[links]] resolve here. */
export function BacklinksPanel({ path }: { path: string }) {
  const { index } = useWorkspace();
  const { hrefFor } = useNoteLinks();
  const [state, setState] = useState<State>({ kind: "loading" });

  // `index` changes whenever the workspace refreshes (tab focus, new note), so
  // backlinks written in other notes or editors show up without a reload.
  useEffect(() => {
    let cancelled = false;
    fetch(backlinksApiUrl(path), { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        if (!cancelled) setState({ kind: "ready", backlinks: json });
      })
      .catch((err) => !cancelled && setState({ kind: "error", message: String(err.message ?? err) }));
    return () => {
      cancelled = true;
    };
  }, [path, index]);

  const count = state.kind === "ready" ? state.backlinks.length : null;

  return (
    <section aria-labelledby="backlinks-heading" className="mt-8 border-t pt-4">
      <h2 id="backlinks-heading" className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Link2 className="size-4" />
        Linked from
        {count !== null && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{count}</span>}
      </h2>

      {state.kind === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
      {state.kind === "error" && <p className="text-sm text-destructive">Couldn&apos;t load backlinks: {state.message}</p>}
      {count === 0 && (
        <p className="text-sm text-muted-foreground">
          No notes link here yet. Link to this note from another with <code className="text-xs">[[{basename(path)}]]</code>.
        </p>
      )}

      {state.kind === "ready" && count! > 0 && (
        <ul className="grid gap-2">
          {state.backlinks.map((b) => (
            <li key={b.path} className="rounded-lg border bg-muted/20 p-3">
              <Link href={hrefFor(b.path)} className="font-medium hover:underline">
                {b.title}
              </Link>
              <span className="ml-2 font-mono text-xs text-muted-foreground">{b.path}</span>
              <ul className="mt-1.5 grid gap-1">
                {b.mentions.map((m) => (
                  <li key={m.line} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="w-8 shrink-0 text-right font-mono text-xs leading-5 tabular-nums opacity-60">
                      L{m.line}
                    </span>
                    <span className="min-w-0 break-words">
                      <Snippet text={m.context} />
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1).replace(/\.md$/i, "");

/** Context line with its [[links]] emphasised. */
function Snippet({ text }: { text: string }) {
  return (
    <>
      {tokenize(text).map((t, i) =>
        typeof t === "string" || t.type === "tag" ? (
          <Fragment key={i}>{typeof t === "string" ? t : t.raw}</Fragment>
        ) : (
          <mark key={i} className="rounded bg-sky-100 px-0.5 text-sky-900 dark:bg-sky-950 dark:text-sky-200">
            {t.alias ?? t.target}
          </mark>
        ),
      )}
    </>
  );
}
