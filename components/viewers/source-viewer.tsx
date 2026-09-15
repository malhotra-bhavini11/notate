"use client";

import dynamic from "next/dynamic";

import { CodeViewer } from "@/components/viewers/code-viewer";
import type { FileAnchor } from "@/lib/anchors";
import { isPdfPath, rawFileUrl } from "@/lib/paths";

// pdf.js touches browser-only APIs at import time, so it never runs on the server.
const PdfViewer = dynamic(() => import("@/components/viewers/pdf-viewer"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground">Loading PDF viewer…</p>,
});

interface SourceViewerProps {
  path: string;
  /** `?lines=19-22` or `?page=3` from the URL. */
  anchor?: FileAnchor | null;
  /** URL for the current view with a different anchor (used when selecting lines). */
  anchorHref?: (anchor: FileAnchor | null) => string;
}

/** Left-pane content: react-pdf for PDFs, the code viewer for everything else. */
export function SourceViewer({ path, anchor, anchorHref }: SourceViewerProps) {
  return isPdfPath(path) ? (
    <PdfViewer url={rawFileUrl(path)} path={path} page={anchor?.kind === "page" ? anchor.page : null} />
  ) : (
    <CodeViewer path={path} anchor={anchor} anchorHref={anchorHref} />
  );
}
