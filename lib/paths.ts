// URL helpers shared by client and server. Workspace paths always use `/`.

import { anchorToParams, type FileAnchor } from "./anchors";

const encodePath = (p: string) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

export const noteHref = (p: string) => `/notes/${encodePath(p)}`;
const querySuffix = (anchor?: FileAnchor | null) => {
  const params = new URLSearchParams(anchorToParams(anchor)).toString();
  return params ? `?${params}` : "";
};

/** `/files/pipelines/qc.py`, optionally `?lines=19-22` or `?page=3`. */
export const fileHref = (p: string, anchor?: FileAnchor | null) => `/files/${encodePath(p)}${querySuffix(anchor)}`;
export const noteApiUrl = (p: string) => `/api/notes/${encodePath(p)}`;
export const rawFileUrl = (p: string) => `/api/files/raw/${encodePath(p)}`;
export const backlinksApiUrl = (p: string) => `/api/backlinks/${encodePath(p)}`;
/** `/tags` for the tag index, `/tags/bio/rna-seq` for one (nested) tag. */
export const tagHref = (tag?: string) => (tag ? `/tags/${encodePath(tag)}` : "/tags");
/** `/references`, or `/references#love2014moderated` to jump to one entry. */
export const referencesHref = (key?: string) => (key ? `/references#${encodeURIComponent(key)}` : "/references");
export const identifiersHref = "/identifiers";
/** `/query?q=type:paper-review` */
export const queryHref = (q?: string) => (q?.trim() ? `/query?q=${encodeURIComponent(q.trim())}` : "/query");
export const queryApiUrl = (q: string) => `/api/query?q=${encodeURIComponent(q)}`;

export const isNotePath = (p: string) => p.toLowerCase().endsWith(".md");
export const isPdfPath = (p: string) => p.toLowerCase().endsWith(".pdf");

/** Where a tree entry should open: notes in the editor, everything else in the file view. */
export const hrefForFile = (p: string) => (isNotePath(p) ? noteHref(p) : fileHref(p));

export interface SplitTarget {
  /** Left pane: PDF or code/text file. */
  file?: string | null;
  /** Right pane: Markdown note. */
  note?: string | null;
  /** Line range or page to show in the left pane. */
  anchor?: FileAnchor | null;
}

// Query values may contain `/`; leaving it unescaped keeps split URLs readable.
const encodeQueryPath = (p: string) => encodeURIComponent(p).replace(/%2F/gi, "/");

/** `/split?file=papers/a.pdf&note=papers/a.md`; either side may be empty. */
export function splitHref({ file, note, anchor }: SplitTarget): string {
  const params = [
    file ? `file=${encodeQueryPath(file)}` : null,
    note ? `note=${encodeQueryPath(note)}` : null,
    ...(file ? Object.entries(anchorToParams(anchor)).map(([k, v]) => `${k}=${v}`) : []),
  ].filter(Boolean);
  return params.length ? `/split?${params.join("&")}` : "/split";
}

export type WorkspaceLocation =
  | { mode: "dashboard" }
  | { mode: "tags"; tag: string | null }
  | { mode: "references" }
  | { mode: "identifiers" }
  | { mode: "query" }
  | { mode: "note"; note: string }
  | { mode: "file"; file: string }
  | { mode: "split"; file: string | null; note: string | null };

/** Interprets the current route so the shell can highlight files and build links. */
export function parseLocation(pathname: string, search: URLSearchParams): WorkspaceLocation {
  if (pathname === "/split") {
    return { mode: "split", file: search.get("file") || null, note: search.get("note") || null };
  }
  if (pathname === "/references") return { mode: "references" };
  if (pathname === "/identifiers") return { mode: "identifiers" };
  if (pathname === "/query") return { mode: "query" };
  const tagMatch = pathname.match(/^\/tags(?:\/(.+))?$/);
  if (tagMatch) return { mode: "tags", tag: tagMatch[1] ? joinSlug(tagMatch[1].split("/")) : null };
  const match = pathname.match(/^\/(notes|files)\/(.+)$/);
  if (!match) return { mode: "dashboard" };
  const path = joinSlug(match[2].split("/"));
  return match[1] === "notes" ? { mode: "note", note: path } : { mode: "file", file: path };
}

/** Link target for a tree entry: in split view files and notes fill their own pane. */
export function treeHrefFor(location: WorkspaceLocation, p: string): string {
  if (location.mode !== "split") return hrefForFile(p);
  return isNotePath(p) ? splitHref({ file: location.file, note: p }) : splitHref({ file: p, note: location.note });
}

/**
 * Link target for `[[file#L19-L22]]` / `[[paper.pdf#page=3]]`: from a note (or
 * split view) the file opens beside that note, so you keep writing while reading.
 */
export function anchoredFileHref(location: WorkspaceLocation, p: string, anchor: FileAnchor): string {
  if (location.mode === "note") return splitHref({ file: p, note: location.note, anchor });
  if (location.mode === "split") return splitHref({ file: p, note: location.note, anchor });
  return fileHref(p, anchor);
}

/** Where the Split view toggle goes: into split with the current file, or back out of it. */
export function splitToggleHref(location: WorkspaceLocation): string {
  switch (location.mode) {
    case "note":
      return splitHref({ note: location.note });
    case "file":
      return splitHref({ file: location.file });
    case "dashboard":
    case "tags":
    case "references":
    case "identifiers":
    case "query":
      return splitHref({});
    case "split":
      if (location.note) return noteHref(location.note);
      if (location.file) return fileHref(location.file);
      return "/";
  }
}

export function activePaths(location: WorkspaceLocation): string[] {
  switch (location.mode) {
    case "note":
      return [location.note];
    case "file":
      return [location.file];
    case "split":
      return [location.file, location.note].filter((p): p is string => Boolean(p));
    default:
      return [];
  }
}

/** `Analysis of Pipeline V2!` -> `analysis-of-pipeline-v2` */
export function slugifyFileName(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

/** Page params may arrive percent-encoded; decode defensively (a literal `%` would throw). */
export function joinSlug(segments: string[]): string {
  return segments
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .join("/");
}

export function relativeTime(ms: number, now = Date.now()): string {
  const sec = Math.round((now - ms) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (sec < 45) return "just now";
  if (sec < 3600) return rtf.format(-Math.max(1, Math.round(sec / 60)), "minute");
  if (sec < 86400) return rtf.format(-Math.round(sec / 3600), "hour");
  if (sec < 7 * 86400) return rtf.format(-Math.round(sec / 86400), "day");
  return new Date(ms).toLocaleDateString();
}
