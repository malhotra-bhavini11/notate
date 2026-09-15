// Anchors into non-note files: line ranges in code (`#L19-L22`, as on GitHub)
// and pages in PDFs (`#page=3`, as in PDF open parameters). Pure.

export type FileAnchor = { kind: "lines"; start: number; end: number } | { kind: "page"; page: number };

const MAX_LINE = 10_000_000;

function lines(a: number, b: number = a): FileAnchor | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1 || a > MAX_LINE || b > MAX_LINE) return null;
  return { kind: "lines", start: Math.min(a, b), end: Math.max(a, b) };
}

/** `L19`, `L19-L22`, `L19-22`, `page=3`, `page3`, `p3`; anything else (a note heading) → null. */
export function parseAnchor(fragment: string | null | undefined): FileAnchor | null {
  const text = fragment?.trim().replace(/^#/, "") ?? "";
  const range = text.match(/^L(\d+)(?:\s*[-–]\s*L?(\d+))?$/i);
  if (range) return lines(Number(range[1]), range[2] ? Number(range[2]) : undefined);
  const page = text.match(/^(?:page=?|p)(\d+)$/i);
  if (page && Number(page[1]) >= 1) return { kind: "page", page: Number(page[1]) };
  return null;
}

/** The `#…` part of a wikilink: `L19-L22`, `L19`, or `page=3`. */
export function formatAnchor(anchor: FileAnchor): string {
  if (anchor.kind === "page") return `page=${anchor.page}`;
  return anchor.start === anchor.end ? `L${anchor.start}` : `L${anchor.start}-L${anchor.end}`;
}

/** Query parameters used by /files and /split: `lines=19-22` or `page=3`. */
export function anchorToParams(anchor: FileAnchor | null | undefined): Record<string, string> {
  if (!anchor) return {};
  if (anchor.kind === "page") return { page: String(anchor.page) };
  return { lines: anchor.start === anchor.end ? String(anchor.start) : `${anchor.start}-${anchor.end}` };
}

export function anchorFromParams(params: { get(name: string): string | null }): FileAnchor | null {
  const lineParam = params.get("lines");
  if (lineParam) {
    const [a, b] = lineParam.split("-").map(Number);
    return lines(a, Number.isNaN(b) || b === undefined ? a : b);
  }
  const page = Number(params.get("page"));
  return Number.isInteger(page) && page >= 1 ? { kind: "page", page } : null;
}

export function anchorsEqual(a: FileAnchor | null | undefined, b: FileAnchor | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return formatAnchor(a) === formatAnchor(b);
}

/** The wikilink that points at `path` (optionally at an anchor), e.g. `[[pipelines/qc.py#L19-L22]]`. */
export function fileLink(path: string, anchor?: FileAnchor | null): string {
  return `[[${path}${anchor ? `#${formatAnchor(anchor)}` : ""}]]`;
}
