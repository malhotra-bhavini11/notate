// Resolves `[[target]]` to a workspace path. Pure; shared by the server's
// backlink index and the client preview so both agree on where a link points.

import { isNotePath, slugifyFileName } from "./paths";

export interface LinkableFile {
  path: string;
  title?: string;
}

export type Resolver = (target: string, fromPath?: string | null) => string | null;

const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const depth = (p: string) => p.split("/").length;

/**
 * Lookup order: path (relative to the linking note, then from the root) →
 * file name → note title → slugified name (`[[DESeq2 Notes]]` → `deseq2-notes.md`).
 * Without an extension only notes match; `[[paper.pdf]]` can link to any file.
 * Ties prefer the linking note's folder, then the shallowest path.
 */
export function createResolver(files: LinkableFile[]): Resolver {
  const index = new Map<string, string[]>();
  const add = (key: string, path: string) => {
    const list = index.get(key);
    if (!list) index.set(key, [path]);
    else if (!list.includes(path)) list.push(path);
  };

  for (const { path, title } of files) {
    const lower = path.toLowerCase();
    const note = isNotePath(path);
    const stem = note ? lower.slice(0, -3) : lower;
    const base = stem.slice(stem.lastIndexOf("/") + 1);
    add(`path:${lower}`, path);
    add(`path:${stem}`, path);
    add(`name:${base}`, path);
    if (note) {
      add(`slug:${slugifyFileName(base)}`, path);
      if (title?.trim()) add(`title:${title.trim().toLowerCase()}`, path);
    }
  }

  const pick = (candidates: string[] | undefined, fromPath?: string | null) => {
    if (!candidates?.length) return null;
    const fromDir = fromPath ? dirOf(fromPath) : null;
    return [...candidates].sort(
      (a, b) =>
        Number(dirOf(b) === fromDir) - Number(dirOf(a) === fromDir) || depth(a) - depth(b) || a.localeCompare(b),
    )[0];
  };

  return (rawTarget, fromPath) => {
    const target = rawTarget.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!target) return null;
    const lower = target.toLowerCase();

    if (lower.includes("/")) {
      const fromDir = fromPath ? dirOf(fromPath) : "";
      return (
        (fromDir ? pick(index.get(`path:${fromDir.toLowerCase()}/${lower}`)) : null) ??
        pick(index.get(`path:${lower}`), fromPath)
      );
    }

    const name = lower.endsWith(".md") ? lower.slice(0, -3) : lower;
    return (
      pick(index.get(`name:${name}`), fromPath) ??
      pick(index.get(`title:${lower}`), fromPath) ??
      pick(index.get(`slug:${slugifyFileName(target)}`), fromPath)
    );
  };
}

/** `bio` matches `bio` and nested `bio/rna-seq`. */
export function tagMatches(noteTag: string, query: string): boolean {
  return noteTag === query || noteTag.startsWith(`${query}/`);
}
