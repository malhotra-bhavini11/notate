"use client";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { ExternalLink, Maximize, Minus, Plus } from "lucide-react";
import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { Button } from "@/components/ui/button";

// Must be set in the same module that renders <Document>. The worker and data
// files are copied to public/pdfjs by scripts/copy-pdfjs-assets.mjs.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

// Stable object identity: react-pdf reloads the document when options change.
const PDF_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
  iccUrl: "/pdfjs/iccs/",
};

const PADDING = 16;
const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const US_LETTER_RATIO = 11 / 8.5;

class PdfErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <p className="p-6 text-sm text-destructive">Couldn&apos;t render PDF: {this.state.error.message}</p>;
    }
    return this.props.children;
  }
}

/**
 * Continuous-scroll PDF reader. Pages fit the pane width (times zoom), only
 * pages near the viewport are rendered, and placeholders keep their height so
 * scrolling stays stable on long documents.
 */
export default function PdfViewer({ url }: { url: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [paneWidth, setPaneWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [defaultRatio, setDefaultRatio] = useState(US_LETTER_RATIO);
  const [zoom, setZoom] = useState(1);
  const [nearby, setNearby] = useState<Set<number>>(() => new Set([1, 2]));
  const [currentPage, setCurrentPage] = useState(1);
  const currentPageRef = useRef(1);
  const [pageInput, setPageInput] = useState("1");

  const pageWidth = Math.max(160, Math.floor((paneWidth - PADDING * 2) * zoom));
  const pageHeight = (n: number) => Math.round(pageWidth * (ratios[n] ?? defaultRatio));

  // Debounced so dragging the split divider doesn't re-render every page each frame.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const observer = new ResizeObserver(([entry]) => {
      clearTimeout(timer);
      const width = entry.contentRect.width;
      timer = setTimeout(() => setPaneWidth(width), first ? 0 : 120);
      first = false;
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // Keep the reader's place when zoom or pane width changes page heights.
  const scrollFraction = useRef(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight > el.clientHeight) el.scrollTop = scrollFraction.current * el.scrollHeight;
  }, [pageWidth]);

  // Render pages within ~1.5 screens of the viewport; unmount the rest.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || numPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setNearby((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const n = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        });
      },
      { root, rootMargin: "150% 0px" },
    );
    pageRefs.current.slice(0, numPages).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    scrollFraction.current = el.scrollHeight ? el.scrollTop / el.scrollHeight : 0;
    const probe = el.scrollTop + el.clientHeight * 0.3;
    let page = 1;
    for (let i = 0; i < numPages; i++) {
      const pageEl = pageRefs.current[i];
      if (pageEl && pageEl.offsetTop <= probe) page = i + 1;
      else break;
    }
    if (page !== currentPageRef.current) {
      currentPageRef.current = page;
      setCurrentPage(page);
      setPageInput(String(page));
    }
  }, [numPages]);

  // Reads only refs: react-pdf keeps the first onItemClick it receives, so this
  // must not close over render-time state like numPages.
  const scrollToPage = useCallback((n: number) => {
    const pages = pageRefs.current;
    const target = pages[Math.min(Math.max(n, 1), pages.length) - 1];
    if (target && scrollRef.current) scrollRef.current.scrollTop = target.offsetTop - PADDING;
  }, []);

  const zoomBy = (direction: 1 | -1) =>
    setZoom((z) => {
      const found = ZOOM_STEPS.findIndex((s) => s >= z - 1e-6);
      const index = (found === -1 ? ZOOM_STEPS.length - 1 : found) + direction;
      return ZOOM_STEPS[Math.min(Math.max(index, 0), ZOOM_STEPS.length - 1)];
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-background px-2 text-sm">
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(pageInput);
            if (Number.isInteger(n)) scrollToPage(n);
            else setPageInput(String(currentPage));
          }}
        >
          <input
            aria-label="Page number"
            inputMode="numeric"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={() => setPageInput(String(currentPage))}
            className="h-7 w-10 rounded-md border bg-transparent text-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <span className="text-muted-foreground tabular-nums">/ {numPages || "–"}</span>
        </form>

        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={() => zoomBy(-1)} disabled={zoom <= ZOOM_STEPS[0]} aria-label="Zoom out">
            <Minus />
          </Button>
          <span className="w-12 text-center text-xs text-muted-foreground tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon-sm" onClick={() => zoomBy(1)} disabled={zoom >= ZOOM_STEPS.at(-1)!} aria-label="Zoom in">
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom(1)} aria-label="Fit width" title="Fit width">
            <Maximize />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            render={<a href={url} target="_blank" rel="noreferrer" />}
            nativeButton={false}
            aria-label="Open PDF in new tab"
            title="Open in new tab"
          >
            <ExternalLink />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto bg-muted/60">
        {paneWidth > 0 && (
          <PdfErrorBoundary>
            <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading PDF…</p>}>
              <Document
                file={url}
                options={PDF_OPTIONS}
                externalLinkTarget="_blank"
                externalLinkRel="noreferrer noopener"
                onLoadSuccess={(pdf) => {
                  setNumPages(pdf.numPages);
                  void pdf.getPage(1).then((page) => {
                    const viewport = page.getViewport({ scale: 1 });
                    setDefaultRatio(viewport.height / viewport.width);
                  });
                }}
                // Internal links (citations, figure refs) jump within our own scroller.
                onItemClick={({ pageNumber }) => scrollToPage(pageNumber)}
                // p-4 and gap-3 must match PADDING and the page offset maths above.
                className="flex flex-col items-center gap-3 p-4"
              >
                {Array.from({ length: numPages }, (_, i) => {
                  const n = i + 1;
                  return (
                    <div
                      key={n}
                      ref={(el) => {
                        pageRefs.current[i] = el;
                      }}
                      data-page={n}
                      className="relative shrink-0 bg-white shadow-sm ring-1 ring-black/5"
                      style={{ width: pageWidth, height: pageHeight(n) }}
                    >
                      {nearby.has(n) && (
                        <Suspense fallback={null}>
                          <Page
                            pageNumber={n}
                            width={pageWidth}
                            onLoadSuccess={(page) => {
                              const r = page.originalHeight / page.originalWidth;
                              setRatios((prev) => (Math.abs((prev[n] ?? 0) - r) < 1e-3 ? prev : { ...prev, [n]: r }));
                            }}
                          />
                        </Suspense>
                      )}
                    </div>
                  );
                })}
              </Document>
            </Suspense>
          </PdfErrorBoundary>
        )}
      </div>
    </div>
  );
}
