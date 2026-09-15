"use client";

import dynamic from "next/dynamic";

import { CodeViewer } from "@/components/viewers/code-viewer";
import { isPdfPath, rawFileUrl } from "@/lib/paths";

// pdf.js touches browser-only APIs at import time, so it never runs on the server.
const PdfViewer = dynamic(() => import("@/components/viewers/pdf-viewer"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground">Loading PDF viewer…</p>,
});

/** Left-pane content: react-pdf for PDFs, the plain code viewer for everything else. */
export function SourceViewer({ path }: { path: string }) {
  return isPdfPath(path) ? <PdfViewer url={rawFileUrl(path)} /> : <CodeViewer path={path} />;
}
