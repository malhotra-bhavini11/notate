import "server-only";

import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-csl";

import { Cite, type CslItem, plugins } from "@citation-js/core";
import fs from "node:fs/promises";

import type { ReferenceDTO, ReferencesDTO } from "../types";
import { resolveInWorkspace, WorkspaceError, writeFileAtomic } from "../workspace";
import { CITEKEY_RE } from "./citekey";

/** The workspace bibliography: plain BibTeX, usable from LaTeX, Pandoc, Zotero. */
export const LIBRARY_FILE = "references.bib";

// Write our citekeys as BibTeX labels; keep output ASCII-safe for classic BibTeX.
const bibtexConfig = plugins.config.get("@bibtex");
bibtexConfig.format.useIdAsLabel = true;
bibtexConfig.format.asciiOnly = true;

const FORMAT = { format: "text", template: "apa", lang: "en-US" } as const;

const stripMarkup = (s: string) =>
  s
    .replace(/<jats:title>[^<]*<\/jats:title>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

function authorName(a: Record<string, unknown>): string {
  if (typeof a.literal === "string") return a.literal;
  const family = [a["non-dropping-particle"], a.family].filter(Boolean).join(" ");
  return a.given ? `${family}, ${a.given}` : family;
}

function arxivId(item: CslItem): string | undefined {
  const fromDoi = str(item.DOI)?.match(/^10\.48550\/arxiv\.(.+)$/i)?.[1];
  const fromUrl = str(item.URL)?.match(/arxiv\.org\/abs\/([^\s?#]+?)(v\d+)?$/i)?.[1];
  return fromDoi ?? fromUrl;
}

/** Flattens a CSL item for the client, including APA text and its BibTeX entry. */
export function toReferenceDTO(item: CslItem & { id: string }): ReferenceDTO {
  const forOutput = { ...item };
  delete forOutput.abstract;
  // With a day present, citation-js writes `month = {dec 5}`, which BibTeX/biber reject.
  const dateParts = (item.issued as { "date-parts"?: unknown[][] } | undefined)?.["date-parts"]?.[0];
  if (dateParts && dateParts.length > 2) forOutput.issued = { "date-parts": [dateParts.slice(0, 2)] };
  const cite = new Cite(forOutput);
  const issued = dateParts?.[0];

  return {
    key: item.id,
    type: str(item.type) ?? "article",
    title: stripMarkup(str(item.title) ?? "Untitled"),
    authors: Array.isArray(item.author) ? item.author.map((a) => authorName(a as Record<string, unknown>)) : [],
    year: typeof issued === "number" ? issued : Number(issued) || undefined,
    container: str(item["container-title"]),
    volume: str(item.volume),
    issue: str(item.issue),
    pages: str(item.page),
    publisher: str(item.publisher),
    doi: str(item.DOI)?.toLowerCase(),
    pmid: str(item.PMID),
    pmcid: str(item.PMCID),
    arxiv: arxivId(item),
    url: str(item.URL),
    abstract: str(item.abstract) ? stripMarkup(str(item.abstract)!) : undefined,
    formatted: stripMarkup(cite.format("bibliography", FORMAT)),
    inText: cite.format("citation", FORMAT).trim().replace(/^\((.*)\)$/, "$1"),
    bibtex: cite.format("bibtex").trim(),
  };
}

interface Library {
  text: string;
  entries: ReferenceDTO[];
  error?: string;
}

let cache: { mtime: number; size: number; library: Library } | null = null;

async function libraryPath() {
  return (await resolveInWorkspace([LIBRARY_FILE])).absolute;
}

export async function readLibrary(): Promise<Library> {
  const path = await libraryPath();
  let stat;
  try {
    stat = await fs.stat(path);
  } catch {
    return { text: "", entries: [] };
  }
  if (cache && cache.mtime === stat.mtimeMs && cache.size === stat.size) return cache.library;

  const text = await fs.readFile(path, "utf8");
  let library: Library;
  if (!text.trim()) {
    library = { text, entries: [] };
  } else {
    try {
      const items = new Cite(text).data.filter((d): d is CslItem & { id: string } => typeof d.id === "string");
      library = { text, entries: items.map(toReferenceDTO) };
    } catch (err) {
      library = {
        text,
        entries: [],
        error: `Couldn't parse ${LIBRARY_FILE}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  cache = { mtime: stat.mtimeMs, size: stat.size, library };
  return library;
}

export async function getReferencesDTO(): Promise<ReferencesDTO> {
  const { entries, error } = await readLibrary();
  return { entries, ...(error ? { error } : {}) };
}

/** Existing entry for the same work, matched by DOI, PMID, or arXiv ID. */
export function findDuplicate(entries: ReferenceDTO[], candidate: ReferenceDTO): ReferenceDTO | undefined {
  return entries.find(
    (e) =>
      (candidate.doi && e.doi === candidate.doi) ||
      (candidate.pmid && e.pmid === candidate.pmid) ||
      (candidate.arxiv && e.arxiv === candidate.arxiv),
  );
}

/**
 * Appends one entry to references.bib, leaving existing entries (and any
 * hand-edits or Zotero formatting) untouched.
 */
export async function addReference(item: CslItem, key: string): Promise<ReferenceDTO> {
  if (!CITEKEY_RE.test(key)) throw new WorkspaceError(`Invalid citation key: ${JSON.stringify(key)}`, 400);

  const library = await readLibrary();
  if (library.error) throw new WorkspaceError(library.error, 409);
  const reference = toReferenceDTO({ ...item, id: key });
  if (library.entries.some((e) => e.key.toLowerCase() === key.toLowerCase())) {
    throw new WorkspaceError(`The key @${key} is already used in ${LIBRARY_FILE}`, 409);
  }
  const duplicate = findDuplicate(library.entries, reference);
  if (duplicate) throw new WorkspaceError(`Already in ${LIBRARY_FILE} as @${duplicate.key}`, 409);

  const next = `${library.text.trimEnd()}${library.text.trim() ? "\n\n" : ""}${reference.bibtex}\n`;
  await writeFileAtomic(await libraryPath(), next);
  return reference;
}
