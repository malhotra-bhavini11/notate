"use client";

import { ExternalLink, FilePlus2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FileIcon } from "@/components/file-tree";
import { NoteEditor } from "@/components/note-editor";
import { SplitPanes } from "@/components/split-panes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SourceViewer } from "@/components/viewers/source-viewer";
import { useWorkspace } from "@/components/workspace-provider";
import { isNotePath, isPdfPath, rawFileUrl, splitHref } from "@/lib/paths";
import { flattenTree } from "@/lib/tree-utils";

interface SplitViewProps {
  file: string | null;
  note: string | null;
}

export function SplitView({ file, note }: SplitViewProps) {
  const router = useRouter();

  return (
    <SplitPanes
      leftLabel="Source file"
      rightLabel="Note"
      left={
        file ? (
          <>
            <PaneHeader path={file} onClose={() => router.push(splitHref({ note }))}>
              {!isPdfPath(file) && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  render={<a href={rawFileUrl(file)} target="_blank" rel="noreferrer" />}
                  nativeButton={false}
                  aria-label="Open raw file in new tab"
                  title="Open raw file"
                >
                  <ExternalLink />
                </Button>
              )}
            </PaneHeader>
            <div className="min-h-0 flex-1">
              <SourceViewer key={file} path={file} />
            </div>
          </>
        ) : (
          <Picker kind="file" onPick={(p) => router.push(splitHref({ file: p, note }))} />
        )
      }
      right={
        note ? (
          <>
            <PaneHeader path={note} onClose={() => router.push(splitHref({ file }))} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NoteEditor
                key={note}
                path={note}
                // A note that records its source file opens it alongside automatically.
                onLoaded={(frontmatter) => {
                  if (!file && typeof frontmatter.source === "string" && frontmatter.source.trim()) {
                    router.replace(splitHref({ file: frontmatter.source.trim(), note }));
                  }
                }}
              />
            </div>
          </>
        ) : (
          <Picker kind="note" sourceFile={file} onPick={(p) => router.push(splitHref({ file, note: p }))} />
        )
      }
    />
  );
}

function PaneHeader({ path, onClose, children }: { path: string; onClose: () => void; children?: React.ReactNode }) {
  const name = path.split("/").pop()!;
  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b bg-muted/30 pr-1 pl-3 text-sm">
      <FileIcon ext={name.split(".").pop()?.toLowerCase()} />
      <span className="truncate font-medium" title={path}>
        {name}
      </span>
      <span className="hidden truncate text-xs text-muted-foreground lg:inline">{path.slice(0, -name.length)}</span>
      <div className="ml-auto flex shrink-0 items-center">
        {children}
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label={`Close ${name}`} title="Close pane">
          <X />
        </Button>
      </div>
    </div>
  );
}

const PICKER_LIMIT = 200;

/** Empty-pane chooser: notes for the right pane, PDFs/code for the left. */
function Picker({
  kind,
  onPick,
  sourceFile,
}: {
  kind: "file" | "note";
  onPick: (path: string) => void;
  sourceFile?: string | null;
}) {
  const { tree, openNewNote } = useWorkspace();
  const [query, setQuery] = useState("");

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flattenTree(tree)
      .filter((f) => (kind === "note" ? isNotePath(f.path) : !isNotePath(f.path)))
      .filter((f) => !q || f.path.toLowerCase().includes(q))
      .sort((a, b) => b.mtime - a.mtime);
  }, [tree, kind, query]);

  function createNoteForSource() {
    if (!sourceFile) return;
    const base = sourceFile.split("/").pop()!.replace(/\.[^.]+$/, "");
    openNewNote({
      templateId: isPdfPath(sourceFile) ? "paper-review" : "code-review",
      title: base.replace(/[-_]+/g, " "),
      frontmatter: { source: sourceFile },
      hrefAfterCreate: (notePath) => splitHref({ file: sourceFile, note: notePath }),
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-6">
      <div>
        <h2 className="font-medium">{kind === "note" ? "Open a note" : "Open a file to read"}</h2>
        <p className="text-sm text-muted-foreground">
          {kind === "note"
            ? "Pick a note to write in, or click one in the sidebar."
            : "Pick a PDF, script, or data file, or click one in the sidebar."}
        </p>
      </div>

      {kind === "note" && sourceFile && (
        <Button variant="outline" className="w-fit" onClick={createNoteForSource}>
          <FilePlus2 />
          New note for {sourceFile.split("/").pop()}
        </Button>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === "note" ? "Filter notes…" : "Filter files…"}
          aria-label={kind === "note" ? "Filter notes" : "Filter files"}
          className="pl-8"
        />
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
        {candidates.length === 0 && (
          <li className="p-3 text-sm text-muted-foreground">{tree ? "Nothing matches." : "Loading…"}</li>
        )}
        {candidates.slice(0, PICKER_LIMIT).map((f) => (
          <li key={f.path} className="border-b last:border-b-0">
            <button
              type="button"
              onClick={() => onPick(f.path)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <FileIcon ext={f.ext} />
              <span className="truncate">{f.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
