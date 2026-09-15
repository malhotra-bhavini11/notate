"use client";

import { useCallback, useMemo } from "react";

import { useWorkspaceLocation } from "@/components/use-workspace-location";
import { useWorkspace } from "@/components/workspace-provider";
import { createResolver } from "@/lib/link-resolver";
import { treeHrefFor } from "@/lib/paths";

/**
 * Link resolution for the current view. Resolved paths open in place: in split
 * view a linked note replaces the right pane and a linked PDF/code file the left.
 */
export function useNoteLinks() {
  const { index } = useWorkspace();
  const location = useWorkspaceLocation();

  const resolve = useMemo(
    () =>
      createResolver([
        ...(index?.notes ?? []).map((n) => ({ path: n.path, title: n.title })),
        ...(index?.files ?? []).map((path) => ({ path })),
      ]),
    [index],
  );

  const hrefFor = useCallback((path: string) => treeHrefFor(location, path), [location]);

  return { resolve, hrefFor, ready: index !== null };
}
