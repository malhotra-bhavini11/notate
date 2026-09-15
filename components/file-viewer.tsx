"use client";

import { SourceViewer } from "@/components/viewers/source-viewer";

/** Full-width view of a single non-note file (`/files/...`). */
export function FileViewer({ path }: { path: string }) {
  return (
    <div className="h-full min-h-0">
      <SourceViewer path={path} />
    </div>
  );
}
