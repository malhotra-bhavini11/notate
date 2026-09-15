// Recognises the scholarly identifiers people paste: bare IDs, prefixed IDs
// (`doi:`, `PMID:`, `arXiv:`), and URLs from doi.org, PubMed, PMC, arXiv, and
// bioRxiv/medRxiv. Pure; used by the lookup API and its tests.

export type IdentifierKind = "doi" | "pmid" | "pmcid" | "arxiv";

export interface Identifier {
  kind: IdentifierKind;
  /** Normalised: DOI lower-cased, PMCID upper-cased `PMC…`, arXiv without version. */
  value: string;
}

// DOI syntax per Crossref's recommended pattern; trailing punctuation from prose is trimmed.
const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>]+)/i;
const ARXIV_NEW_RE = /^(\d{4}\.\d{4,5})(v\d+)?$/i;
const ARXIV_OLD_RE = /^([a-z-]+(?:\.[a-z]{2})?\/\d{7})(v\d+)?$/i;

function cleanDoi(doi: string): string {
  let out = decodeURIComponentSafe(doi).replace(/[.,;:)\]}>]+$/, "");
  // bioRxiv/medRxiv URLs append a version (v1) and sometimes a file suffix.
  out = out.replace(/^(10\.1101\/[\d.]+)v\d+.*$/i, "$1");
  return out.toLowerCase();
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function arxivFrom(candidate: string): Identifier | null {
  const id = candidate.replace(/\.pdf$/i, "");
  const match = id.match(ARXIV_NEW_RE) ?? id.match(ARXIV_OLD_RE);
  return match ? { kind: "arxiv", value: match[1].toLowerCase() } : null;
}

export function parseIdentifier(input: string): Identifier | null {
  const text = input.trim();
  if (!text) return null;

  // URLs: pick the identifier out of the path.
  if (/^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = decodeURIComponentSafe(url.pathname);

    if (host === "arxiv.org" || host === "export.arxiv.org") {
      const m = path.match(/^\/(?:abs|pdf|html)\/(.+?)\/?$/);
      return m ? arxivFrom(m[1]) : null;
    }
    if (host === "pubmed.ncbi.nlm.nih.gov") {
      const m = path.match(/^\/(\d{1,9})\/?$/);
      return m ? { kind: "pmid", value: m[1] } : null;
    }
    if (host.endsWith("ncbi.nlm.nih.gov")) {
      const m = path.match(/\/(PMC\d+)\/?/i);
      if (m) return { kind: "pmcid", value: m[1].toUpperCase() };
    }
    const doi = path.match(DOI_RE);
    return doi ? identifierFromDoi(cleanDoi(doi[1])) : null;
  }

  const prefixed = text.match(/^(doi|pmid|pmcid|arxiv)\s*:\s*(.+)$/i);
  if (prefixed) {
    const [, prefix, rest] = prefixed;
    switch (prefix.toLowerCase()) {
      case "doi":
        return DOI_RE.test(rest) ? identifierFromDoi(cleanDoi(rest.match(DOI_RE)![1])) : null;
      case "pmid":
        return /^\d{1,9}$/.test(rest.trim()) ? { kind: "pmid", value: rest.trim() } : null;
      case "pmcid":
        return /^(PMC)?\d+$/i.test(rest.trim())
          ? { kind: "pmcid", value: `PMC${rest.trim().replace(/^PMC/i, "")}` }
          : null;
      default:
        return arxivFrom(rest.trim());
    }
  }

  if (/^PMC\d+$/i.test(text)) return { kind: "pmcid", value: text.toUpperCase() };
  if (/^\d{1,9}$/.test(text)) return { kind: "pmid", value: text };
  const arxiv = arxivFrom(text);
  if (arxiv) return arxiv;
  const doi = text.match(DOI_RE);
  return doi ? identifierFromDoi(cleanDoi(doi[1])) : null;
}

/** arXiv's DataCite DOIs (10.48550/arXiv.x) are treated as arXiv IDs. */
function identifierFromDoi(doi: string): Identifier {
  const arxiv = doi.match(/^10\.48550\/arxiv\.(.+)$/i);
  return (arxiv && arxivFrom(arxiv[1])) || { kind: "doi", value: doi };
}

export function describeIdentifier(id: Identifier): string {
  switch (id.kind) {
    case "doi":
      return `DOI ${id.value}`;
    case "pmid":
      return `PMID ${id.value}`;
    case "pmcid":
      return id.value;
    case "arxiv":
      return `arXiv:${id.value}`;
  }
}
