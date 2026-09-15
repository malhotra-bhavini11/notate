"use client";

import { SourceViewer } from "@/components/viewers/source-viewer";
import type { FileAnchor } from "@/lib/anchors";
import { fileHref } from "@/lib/paths";

/** Full-width view of a single non-note file (`/files/...`). */
export function FileViewer({ path, anchor }: { path: string; anchor: FileAnchor | null }) {
  return (
    <div className="h-full min-h-0">
      <SourceViewer path={path} anchor={anchor} anchorHref={(next) => fileHref(path, next)} />
    </div>
  );
}
