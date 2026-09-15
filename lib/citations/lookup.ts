import "server-only";

import type { CslItem } from "@citation-js/core";

import { WorkspaceError } from "../workspace";
import { describeIdentifier, type Identifier } from "./identifiers";

// Every source answers in CSL-JSON: DOI content negotiation covers Crossref and
// DataCite (arXiv, Zenodo, bioRxiv), and NCBI's citation exporter covers PubMed/PMC.
// Redirects are followed manually and only to these metadata hosts, over HTTPS,
// so a crafted DOI can't point the server at a local or arbitrary address.
const ALLOWED_HOSTS = ["doi.org", "crossref.org", "crosscite.org", "datacite.org", "medra.org", "jalc.org", "ncbi.nlm.nih.gov"];
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;

const isAllowed = (url: URL) =>
  url.protocol === "https:" &&
  ALLOWED_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));

type Fetcher = typeof fetch;

async function fetchCsl(start: string, accept: string, fetcher: Fetcher, label: string): Promise<unknown> {
  let url = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowed(url)) throw new WorkspaceError(`Refusing to fetch metadata from ${url.hostname}`, 403);

    let res: Response;
    try {
      res = await fetcher(url, {
        headers: { Accept: accept, "User-Agent": "notate (local research notes)" },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new WorkspaceError(timedOut ? `Timed out looking up ${label}` : `Couldn't reach the metadata service for ${label}`, 504);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      url = new URL(location, url);
      continue;
    }
    if (res.status === 404 || res.status === 400) throw new WorkspaceError(`No record found for ${label}`, 404);
    if (!res.ok) throw new WorkspaceError(`Metadata service returned ${res.status} for ${label}`, 502);

    const declared = Number(res.headers.get("content-length"));
    const text = declared > MAX_BYTES ? "" : await res.text();
    if (declared > MAX_BYTES || text.length > MAX_BYTES) {
      throw new WorkspaceError(`Metadata for ${label} is unexpectedly large`, 413);
    }
    try {
      return JSON.parse(text);
    } catch {
      // DOIs whose registration agency doesn't support content negotiation land on an HTML page.
      throw new WorkspaceError(`No citation metadata available for ${label}`, 404);
    }
  }
  throw new WorkspaceError(`Too many redirects looking up ${label}`, 502);
}

const CSL_FIELDS = [
  "type", "title", "author", "editor", "issued", "container-title", "container-title-short", "volume", "issue",
  "page", "DOI", "PMID", "PMCID", "URL", "publisher", "publisher-place", "ISSN", "ISBN", "abstract", "language",
] as const;

// Crossref's content negotiation reports its own work types; map them to CSL
// types so APA formatting and BibTeX entry types come out right.
const CROSSREF_TO_CSL: Record<string, string> = {
  "journal-article": "article-journal",
  "posted-content": "article",
  "proceedings-article": "paper-conference",
  "book-chapter": "chapter",
  "book-section": "chapter",
  "edited-book": "book",
  monograph: "book",
  "reference-book": "book",
  "reference-entry": "entry",
  dissertation: "thesis",
  "report-series": "report",
  component: "article",
  "peer-review": "review",
};

/** Keeps citation fields only (Crossref adds reference lists, licences, funders…). */
function normalize(raw: unknown, id: Identifier): CslItem {
  const source = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
  if (!source || typeof source !== "object" || (typeof source.title !== "string" && !Array.isArray(source.title))) {
    throw new WorkspaceError(`No record found for ${describeIdentifier(id)}`, 404);
  }
  const item: CslItem = {};
  for (const field of CSL_FIELDS) if (source[field] !== undefined) item[field] = source[field];
  // Some sources send arrays where CSL expects strings.
  for (const field of ["title", "container-title", "container-title-short", "ISSN"] as const) {
    if (Array.isArray(item[field])) item[field] = (item[field] as unknown[])[0];
  }
  if (typeof item.type === "string") item.type = CROSSREF_TO_CSL[item.type] ?? item.type;

  if (id.kind === "arxiv") {
    item.type = "article";
    item.publisher = "arXiv";
    item.DOI = `10.48550/arXiv.${id.value}`;
    item.URL = `https://arxiv.org/abs/${id.value}`;
    item.number = id.value;
  } else if (typeof item.DOI === "string") {
    item.DOI = item.DOI.toLowerCase();
  }
  if (id.kind === "pmid") item.PMID = id.value;
  if (id.kind === "pmcid") item.PMCID = id.value;
  return item;
}

const cache = new Map<string, { at: number; item: CslItem }>();

/**
 * Fetches and normalises metadata for an identifier. Results are cached briefly
 * so "look up, then add" doesn't hit the network twice.
 */
export async function lookupIdentifier(id: Identifier, fetcher: Fetcher = fetch): Promise<CslItem> {
  const cacheKey = `${id.kind}:${id.value}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return structuredClone(hit.item);

  const label = describeIdentifier(id);
  const raw =
    id.kind === "pmid" || id.kind === "pmcid"
      ? await fetchCsl(
          // NCBI answers 406 to any specific Accept type, and wants PMC IDs without the prefix.
          `https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/${id.kind === "pmid" ? "pubmed" : "pmc"}/?format=csl&id=${encodeURIComponent(id.value.replace(/^PMC/i, ""))}`,
          "*/*",
          fetcher,
          label,
        )
      : await fetchCsl(
          `https://doi.org/${(id.kind === "arxiv" ? `10.48550/arXiv.${id.value}` : id.value).split("/").map(encodeURIComponent).join("/")}`,
          "application/vnd.citationstyles.csl+json",
          fetcher,
          label,
        );

  const item = normalize(raw, id);
  cache.set(cacheKey, { at: Date.now(), item });
  return structuredClone(item);
}
