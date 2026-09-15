"use client";

import { Check, CircleAlert, Eye, LoaderCircle, Pencil } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { BacklinksPanel } from "@/components/backlinks-panel";
import { FrontmatterCard } from "@/components/frontmatter-card";
import { useLinkAutocomplete } from "@/components/link-autocomplete";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/components/workspace-provider";
import { noteApiUrl } from "@/lib/paths";
import { getTemplate } from "@/lib/templates";
import type { Frontmatter, NoteDTO, SaveNoteBody } from "@/lib/types";
import { cn } from "@/lib/utils";

const AUTOSAVE_DELAY_MS = 1000;

type SaveStatus = "saved" | "unsaved" | "saving" | "error";
interface Doc {
  frontmatter: Frontmatter;
  content: string;
}
type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

async function postNote(path: string, body: SaveNoteBody, keepalive = false) {
  const res = await fetch(noteApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `Save failed (${res.status})`);
  }
}

interface NoteEditorProps {
  path: string;
  /** Called once with the note's frontmatter after it loads (split view uses `source`). */
  onLoaded?: (frontmatter: Frontmatter) => void;
}

export function NoteEditor({ path, onLoaded }: NoteEditorProps) {
  const { refresh } = useWorkspace();
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [doc, setDoc] = useState<Doc>({ frontmatter: {}, content: "" });
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");

  // Refs let the debounced save always see the newest edit without re-subscribing.
  const latest = useRef(doc);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(noteApiUrl(path), { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setLoad({ kind: "missing" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        const note = json as NoteDTO;
        const loaded = { frontmatter: note.frontmatter, content: note.content };
        latest.current = loaded;
        setDoc(loaded);
        setLoad({ kind: "ready" });
        onLoadedRef.current?.(note.frontmatter);
      })
      .catch((err) => !cancelled && setLoad({ kind: "error", message: String(err.message ?? err) }));
    return () => {
      cancelled = true;
    };
  }, [path]);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    // Never run two POSTs at once (they could land out of order); the running
    // save picks up the queued request when it finishes.
    if (inFlight.current) {
      queued.current = true;
      return;
    }

    inFlight.current = true;
    try {
      do {
        queued.current = false;
        if (revision.current === savedRevision.current) break;
        const rev = revision.current;
        setStatus("saving");
        await postNote(path, latest.current);
        savedRevision.current = rev;
      } while (queued.current);
      setSaveError(null);
      setStatus(revision.current === savedRevision.current ? "saved" : "unsaved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [path]);

  const update = useCallback(
    (patch: Partial<Doc>) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      revision.current += 1;
      setDoc(next);
      setStatus("unsaved");
      clearTimeout(timer.current);
      timer.current = setTimeout(save, AUTOSAVE_DELAY_MS);
    },
    [save],
  );

  // [[ autocomplete rewrites the content, then restores the caret after React renders it.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const autocomplete = useLinkAutocomplete(textareaRef, (content, caret) => {
    pendingCaret.current = caret;
    update({ content });
  });
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el && pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [doc.content]);

  // Warn before closing the tab with unsaved edits; flush pending edits when navigating away in-app.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (revision.current !== savedRevision.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(timer.current);
      if (revision.current !== savedRevision.current) {
        void postNote(path, latest.current, true).catch(() => {});
      }
    };
  }, [path]);

  async function createMissing() {
    const title = path.split("/").pop()!.replace(/\.md$/i, "").replace(/[-_]+/g, " ");
    const blank = getTemplate("blank");
    const created = { frontmatter: blank.frontmatter(title, new Date().toLocaleDateString("en-CA")), content: blank.body(title) };
    try {
      await postNote(path, { ...created, createOnly: true });
      latest.current = created;
      setDoc(created);
      setLoad({ kind: "ready" });
      void refresh();
    } catch (err) {
      setLoad({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (load.kind === "loading") {
    return <p className="p-8 text-sm text-muted-foreground">Loading note…</p>;
  }
  if (load.kind === "missing") {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-lg font-semibold">Note not found</h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">workspace/{path}</p>
        <Button className="mt-4" onClick={createMissing}>
          Create this note
        </Button>
      </div>
    );
  }
  if (load.kind === "error") {
    return <p className="p-8 text-sm text-destructive">Couldn&apos;t open note: {load.message}</p>;
  }

  return (
    <div
      className="mx-auto flex min-h-full max-w-3xl flex-col px-6 py-6"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <FrontmatterCard frontmatter={doc.frontmatter} onChange={(frontmatter) => update({ frontmatter })} />

      <div className="mb-3 flex items-center justify-between gap-2">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "write" | "preview")}>
          <TabsList>
            <TabsTrigger value="write">
              <Pencil />
              Write
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Eye />
              Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <SaveIndicator status={status} error={saveError} onRetry={() => void save()} />
      </div>

      {mode === "write" ? (
        <div className="relative flex flex-1 flex-col">
          <textarea
            ref={textareaRef}
            value={doc.content}
            onChange={(e) => {
              update({ content: e.target.value });
              autocomplete.sync(e.target);
            }}
            onKeyDown={(e) => {
              autocomplete.onKeyDown(e);
            }}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow") && !autocomplete.open) autocomplete.sync(e.currentTarget);
            }}
            onClick={(e) => autocomplete.sync(e.currentTarget)}
            onBlur={autocomplete.close}
            onScroll={autocomplete.close}
            spellCheck
            aria-label="Note body (Markdown)"
            aria-autocomplete="list"
            placeholder="Write in Markdown. [[Link a note]], #tags, $inline math$, | tables |, ```code```"
            className="min-h-[60vh] w-full flex-1 resize-none rounded-xl border bg-background p-4 font-mono text-sm leading-relaxed outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          {autocomplete.popup()}
        </div>
      ) : (
        <div className="min-h-[60vh] rounded-xl border p-6">
          {doc.content.trim() ? (
            <MarkdownPreview content={doc.content} fromPath={path} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview.</p>
          )}
        </div>
      )}

      <BacklinksPanel path={path} />
    </div>
  );
}

function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  const base = "flex items-center gap-1.5 text-xs";
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2">
      {status === "saved" && (
        <span className={cn(base, "text-muted-foreground")}>
          <Check className="size-3.5" /> Saved
        </span>
      )}
      {status === "unsaved" && <span className={cn(base, "text-muted-foreground")}>Unsaved changes</span>}
      {status === "saving" && (
        <span className={cn(base, "text-muted-foreground")}>
          <LoaderCircle className="size-3.5 animate-spin" /> Saving…
        </span>
      )}
      {status === "error" && (
        <>
          <span className={cn(base, "text-destructive")} title={error ?? undefined}>
            <CircleAlert className="size-3.5" /> Save failed
          </span>
          <Button size="xs" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </>
      )}
    </div>
  );
}
