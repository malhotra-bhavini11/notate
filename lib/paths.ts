// URL helpers shared by client and server. Workspace paths always use `/`.

const encodePath = (p: string) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

export const noteHref = (p: string) => `/notes/${encodePath(p)}`;
export const fileHref = (p: string) => `/files/${encodePath(p)}`;
export const noteApiUrl = (p: string) => `/api/notes/${encodePath(p)}`;
export const rawFileUrl = (p: string) => `/api/files/raw/${encodePath(p)}`;

/** Where a tree entry should open: notes in the editor, everything else in the file view. */
export const hrefForFile = (p: string) => (p.toLowerCase().endsWith(".md") ? noteHref(p) : fileHref(p));

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
