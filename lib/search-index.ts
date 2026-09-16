import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { parseMarkdown } from "./frontmatter";
import { buildTree } from "./tree";
import { flattenTree } from "./tree-utils";
import { parseSearch, type SearchDoc, searchDocs, type SearchOptions, type SearchResult } from "./search";
import { ensureWorkspace } from "./workspace";

// Text files are read whole and kept in memory, so a stray multi-megabyte log
// doesn't get indexed. Notes are never anywhere near this.
const MAX_INDEXED_BYTES = 512 * 1024;
// A NUL byte in the first chunk means binary, the heuristic git and grep use.
const SNIFF_BYTES = 8000;

// Extensions worth searching beside notes: the code, configs and data a review
// refers to. PDFs would need text extraction and are left out.
const SEARCHABLE = new Set([
  "md", "markdown", "txt", "rst", "org", "tex", "bib",
  "py", "pyw", "smk", "r", "rmd", "qmd", "jl", "m", "sh", "bash", "zsh",
  "sql", "nf", "groovy", "yaml", "yml", "cwl", "json", "jsonc", "toml", "ini", "cfg", "conf",
  "xml", "csv", "tsv", "html", "css", "js", "mjs", "cjs", "ts", "tsx",
  "c", "h", "cpp", "cc", "hpp", "rs", "go", "java", "pl", "f90", "diff", "patch", "log",
]);

const cache = new Map<string, { mtime: number; size: number; doc: SearchDoc }>();

async function read(root: string, relPath: string, mtime: number): Promise<SearchDoc | null> {
  const absolute = path.join(root, ...relPath.split("/"));
  const buffer = await fs.readFile(absolute);
  if (buffer.subarray(0, SNIFF_BYTES).includes(0)) return null;
  const text = buffer.toString("utf8");
  const name = relPath.slice(relPath.lastIndexOf("/") + 1);

  if (!relPath.toLowerCase().endsWith(".md")) {
    return { path: relPath, title: name, kind: "file", text, bodyOffset: 0, mtime };
  }
  let title = name.slice(0, -3);
  let bodyOffset = 0;
  try {
    const { frontmatter, content } = parseMarkdown(text);
    if (typeof frontmatter.title === "string" && frontmatter.title.trim()) title = frontmatter.title;
    // Lines of frontmatter, so a hit can be reported body-relative as well.
    if (text.endsWith(content)) bodyOffset = text.slice(0, text.length - content.length).split("\n").length - 1;
  } catch {
    // Malformed YAML: still searchable, just without a title from it.
  }
  return { path: relPath, title, kind: "note", text, bodyOffset, mtime };
}

/** Every searchable file, re-read only when its mtime or size changes. */
async function documents(): Promise<SearchDoc[]> {
  const root = await ensureWorkspace();
  const files = flattenTree(await buildTree(root)).filter(
    (f) => f.ext && SEARCHABLE.has(f.ext) && (f.size ?? 0) <= MAX_INDEXED_BYTES,
  );
  const seen = new Set<string>();

  const docs = await Promise.all(
    files.map(async (file) => {
      seen.add(file.path);
      const hit = cache.get(file.path);
      if (hit && hit.mtime === file.mtime && hit.size === (file.size ?? 0)) return hit.doc;
      try {
        const doc = await read(root, file.path, file.mtime);
        if (doc) cache.set(file.path, { mtime: file.mtime, size: file.size ?? 0, doc });
        return doc;
      } catch {
        return null; // deleted or unreadable between the scan and the read
      }
    }),
  );
  for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key);
  return docs.filter((doc): doc is SearchDoc => doc !== null);
}

export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const parsed = parseSearch(query);
  if (parsed.terms.length === 0) return [];
  return searchDocs(await documents(), parsed, options);
}

/** Note bodies keyed by path, so `type:paper-review dispersion` can match text too. */
export async function noteText(): Promise<Map<string, string>> {
  const docs = await documents();
  return new Map(docs.filter((d) => d.kind === "note").map((d) => [d.path, d.text]));
}
