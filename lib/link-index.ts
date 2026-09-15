import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { parseMarkdown } from "./frontmatter";
import { createResolver, type Resolver } from "./link-resolver";
import { extractLinksAndTags, normalizeTag, type ExtractedLink } from "./markdown-tokens";
import { buildTree } from "./tree";
import { flattenTree } from "./tree-utils";
import type { BacklinkDTO, IndexDTO } from "./types";
import { toTags } from "./values";
import { ensureWorkspace, resolveInWorkspace, WorkspaceError } from "./workspace";

interface IndexedNote {
  path: string;
  title: string;
  type?: string;
  /** Frontmatter and inline tags, normalized and de-duplicated. */
  tags: string[];
  links: ExtractedLink[];
  /** Keys cited with [@key] in the body. */
  citations: string[];
  /** Frontmatter `citekey`: this note is the reading note for that reference. */
  citekey?: string;
  /** `database:id` refs for accessions mentioned in the body. */
  accessions: string[];
  mtime: number;
}

// Parsed notes keyed by path; re-parsed only when mtime or size changes, so
// rebuilding the index on each request costs one directory scan.
const cache = new Map<string, { mtime: number; size: number; note: IndexedNote }>();

async function indexNote(root: string, relPath: string, mtime: number): Promise<IndexedNote> {
  const raw = await fs.readFile(path.join(root, ...relPath.split("/")), "utf8");
  const fallbackTitle = path.basename(relPath, ".md");
  let frontmatter: Record<string, unknown> = {};
  let content = raw;
  try {
    ({ frontmatter, content } = parseMarkdown(raw));
  } catch {
    // Malformed YAML: still index links in the body so the note isn't invisible.
  }
  const { links, tags, citations, accessions } = extractLinksAndTags(content);
  // Report file line numbers (as in any other editor), not body-relative ones.
  const bodyOffset = raw.endsWith(content) ? raw.slice(0, raw.length - content.length).split("\n").length - 1 : 0;
  for (const link of links) link.line += bodyOffset;
  return {
    path: relPath,
    title: typeof frontmatter.title === "string" && frontmatter.title.trim() ? frontmatter.title : fallbackTitle,
    type: typeof frontmatter.type === "string" ? frontmatter.type : undefined,
    tags: [...new Set([...toTags(frontmatter.tags).map(normalizeTag), ...tags])].filter(Boolean),
    links,
    citations,
    citekey: typeof frontmatter.citekey === "string" && frontmatter.citekey.trim() ? frontmatter.citekey.trim() : undefined,
    accessions,
    mtime,
  };
}

export interface LinkIndex {
  notes: IndexedNote[];
  files: { path: string; ext?: string }[];
  resolve: Resolver;
}

export async function getLinkIndex(): Promise<LinkIndex> {
  const root = await ensureWorkspace();
  const files = flattenTree(await buildTree(root));
  const seen = new Set<string>();

  const notes = await Promise.all(
    files
      .filter((f) => f.ext === "md")
      .map(async (f) => {
        seen.add(f.path);
        const hit = cache.get(f.path);
        if (hit && hit.mtime === f.mtime && hit.size === f.size) return hit.note;
        try {
          const note = await indexNote(root, f.path, f.mtime);
          cache.set(f.path, { mtime: f.mtime, size: f.size ?? 0, note });
          return note;
        } catch {
          return null; // Deleted or unreadable between the scan and the read.
        }
      }),
  );
  for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key);

  const indexed = notes.filter((n): n is IndexedNote => n !== null);
  const titles = new Map(indexed.map((n) => [n.path, n.title]));
  return {
    notes: indexed,
    files: files.map((f) => ({ path: f.path, ext: f.ext })),
    resolve: createResolver(files.map((f) => ({ path: f.path, title: titles.get(f.path) }))),
  };
}

/** Everything the client needs to resolve links, list tags, and autocomplete. */
export async function getIndexDTO(): Promise<IndexDTO> {
  const { notes, files } = await getLinkIndex();
  const counts = new Map<string, number>();
  for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);

  return {
    notes: notes
      .map(({ path, title, type, tags, citations, citekey, accessions, mtime }) => ({
        path,
        title,
        type,
        tags,
        citations,
        citekey,
        accessions,
        mtime,
      }))
      .sort((a, b) => b.mtime - a.mtime),
    files: files.filter((f) => f.ext !== "md").map((f) => f.path),
    tags: [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
  };
}

/** Notes whose `[[links]]` resolve to `segments`, with the lines that mention it. */
export async function getBacklinks(segments: string[]): Promise<BacklinkDTO[]> {
  const { relative } = await resolveInWorkspace(segments);
  const { notes, files, resolve } = await getLinkIndex();
  if (!files.some((f) => f.path === relative)) throw new WorkspaceError(`File not found: ${relative}`, 404);

  const backlinks: BacklinkDTO[] = [];
  for (const note of notes) {
    if (note.path === relative) continue;
    const mentions = note.links
      .filter((l) => resolve(l.target, note.path) === relative)
      .map(({ line, context }) => ({ line, context }));
    if (mentions.length) backlinks.push({ path: note.path, title: note.title, mentions });
  }
  return backlinks.sort((a, b) => a.title.localeCompare(b.title));
}
