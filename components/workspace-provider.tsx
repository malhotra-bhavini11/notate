"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { TreeNode } from "@/lib/types";

interface WorkspaceContextValue {
  tree: TreeNode | null;
  error: string | null;
  loading: boolean;
  /** Re-fetches the tree, e.g. after creating a note. */
  refresh: () => Promise<void>;
  newNoteOpen: boolean;
  setNewNoteOpen: (open: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

async function fetchTree(): Promise<TreeNode> {
  const res = await fetch("/api/fs/tree", { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newNoteOpen, setNewNoteOpen] = useState(false);

  const refresh = useCallback(
    () =>
      fetchTree()
        .then(
          (next) => {
            setTree(next);
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

  const value = useMemo(
    () => ({ tree, error, loading, refresh, newNoteOpen, setNewNoteOpen }),
    [tree, error, loading, refresh, newNoteOpen],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
