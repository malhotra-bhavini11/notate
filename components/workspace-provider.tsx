"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { Frontmatter, IndexDTO, TreeNode } from "@/lib/types";

/** Presets for the New note dialog, e.g. when creating a note for the open PDF. */
export interface NewNoteRequest {
  templateId?: string;
  title?: string;
  /** Overrides the template's default folder. */
  folder?: string;
  /** Merged into the template's frontmatter, e.g. `{ source: "papers/x.pdf" }`. */
  frontmatter?: Frontmatter;
  /** Where to go once created; defaults to the note page. */
  hrefAfterCreate?: (notePath: string) => string;
}

interface WorkspaceContextValue {
  tree: TreeNode | null;
  /** Note titles/tags and linkable files, for link resolution, tags, and autocomplete. */
  index: IndexDTO | null;
  error: string | null;
  loading: boolean;
  /** Re-fetches the tree and index, e.g. after creating a note. */
  refresh: () => Promise<void>;
  /** Non-null while the New note dialog is open. */
  newNote: (NewNoteRequest & { id: number }) | null;
  openNewNote: (request?: NewNoteRequest) => void;
  closeNewNote: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [index, setIndex] = useState<IndexDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState<WorkspaceContextValue["newNote"]>(null);

  const refresh = useCallback(
    () =>
      Promise.all([fetchJson<TreeNode>("/api/fs/tree"), fetchJson<IndexDTO>("/api/index")])
        .then(
          ([nextTree, nextIndex]) => {
            setTree(nextTree);
            setIndex(nextIndex);
            setError(null);
          },
          (err) => setError(err instanceof Error ? err.message : String(err)),
        )
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void refresh();
    // Pick up files added or edited outside the app when the user comes back to the tab.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // The id changes on every open so the dialog's form resets to the new presets.
  const openNewNote = useCallback((request: NewNoteRequest = {}) => setNewNote({ ...request, id: Date.now() }), []);
  const closeNewNote = useCallback(() => setNewNote(null), []);

  const value = useMemo(
    () => ({ tree, index, error, loading, refresh, newNote, openNewNote, closeNewNote }),
    [tree, index, error, loading, refresh, newNote, openNewNote, closeNewNote],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
