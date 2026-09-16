// Full-text search over note and file contents. Pure: the server runs it, and
// the tests cover it without touching the file system.

export interface SearchTerm {
  /** Lower-cased text to look for. */
  text: string;
  /** `-word` — documents containing it are left out. */
  negate: boolean;
}

export interface ParsedSearch {
  terms: SearchTerm[];
  /** True when the query has nothing to match on. */
  empty: boolean;
}

/** `dispersion "raw counts" -deprecated` — words AND together, quotes keep phrases whole. */
export function parseSearch(input: string): ParsedSearch {
  const terms: SearchTerm[] = [];
  const pattern = /(-?)"([^"]*)"|(-?)(\S+)/g;
  for (const match of input.matchAll(pattern)) {
    const negate = (match[1] || match[3]) === "-";
    const text = (match[2] ?? match[4] ?? "").trim().toLowerCase();
    if (text && !terms.some((t) => t.text === text && t.negate === negate)) terms.push({ text, negate });
  }
  return { terms, empty: terms.every((t) => t.negate) };
}

export interface SearchDoc {
  path: string;
  /** Note title, or the file name for other files. */
  title: string;
  kind: "note" | "file";
  /** Raw text, as on disk. */
  text: string;
  /** Lines of frontmatter, so a note's hits can also be given body-relative. */
  bodyOffset: number;
  mtime: number;
}

export interface SearchHit {
  /** 1-based line in the file, counting frontmatter. */
  line: number;
  /** The same line relative to the note body, or 0 or less for one in the frontmatter. */
  bodyLine: number;
  text: string;
  /** `[start, end)` character ranges to highlight in `text`. */
  ranges: [number, number][];
  /** Set when the line was trimmed around the match. */
  trimmedStart?: boolean;
  trimmedEnd?: boolean;
}

export interface SearchResult {
  path: string;
  title: string;
  kind: "note" | "file";
  /** Total matches in the document. */
  matches: number;
  score: number;
  hits: SearchHit[];
  mtime: number;
}

const SNIPPET_LENGTH = 200;
const DEFAULT_HITS = 3;

const countOccurrences = (haystack: string, needle: string): number => {
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) count++;
  return count;
};

/** Every match of every positive term in one line, merged and in order. */
function rangesIn(lower: string, terms: SearchTerm[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const term of terms) {
    for (let i = lower.indexOf(term.text); i !== -1; i = lower.indexOf(term.text, i + term.text.length)) {
      ranges.push([i, i + term.text.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** Keeps a long line readable by cutting around the first match. */
function trim(text: string, ranges: [number, number][]): Omit<SearchHit, "line" | "bodyLine"> {
  if (text.length <= SNIPPET_LENGTH) return { text, ranges };
  const first = ranges[0]?.[0] ?? 0;
  const start = Math.max(0, first - Math.floor(SNIPPET_LENGTH / 3));
  const end = Math.min(text.length, start + SNIPPET_LENGTH);
  return {
    text: text.slice(start, end),
    ranges: ranges
      .map(([a, b]) => [a - start, b - start] as [number, number])
      .filter(([a, b]) => b > 0 && a < end - start)
      .map(([a, b]) => [Math.max(0, a), Math.min(end - start, b)] as [number, number]),
    trimmedStart: start > 0,
    trimmedEnd: end < text.length,
  };
}

export interface SearchOptions {
  limit?: number;
  /** Lines shown per document. */
  hitsPerDoc?: number;
}

/**
 * Ranks documents containing every positive term and no negative one. A hit in
 * the title or path counts for more, and ties go to the most recently edited.
 */
export function searchDocs(docs: SearchDoc[], query: ParsedSearch, options: SearchOptions = {}): SearchResult[] {
  const { limit = 50, hitsPerDoc = DEFAULT_HITS } = options;
  const positive = query.terms.filter((t) => !t.negate);
  if (positive.length === 0) return [];

  const results: SearchResult[] = [];
  for (const doc of docs) {
    const lower = doc.text.toLowerCase();
    const where = `${doc.title}\n${doc.path}`.toLowerCase();
    if (query.terms.some((t) => t.negate && (lower.includes(t.text) || where.includes(t.text)))) continue;
    if (!positive.every((t) => lower.includes(t.text) || where.includes(t.text))) continue;

    let matches = 0;
    let score = 0;
    for (const term of positive) {
      const inText = countOccurrences(lower, term.text);
      matches += inText;
      score += inText;
      if (where.includes(term.text)) score += 10;
      // A whole word beats a match inside a longer one.
      if (new RegExp(`\\b${term.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) score += 2;
    }

    const hits: SearchHit[] = [];
    const lines = doc.text.split(/\r?\n/);
    for (let i = 0; i < lines.length && hits.length < hitsPerDoc; i++) {
      const ranges = rangesIn(lines[i].toLowerCase(), positive);
      if (ranges.length === 0) continue;
      hits.push({ line: i + 1, bodyLine: i + 1 - doc.bodyOffset, ...trim(lines[i], ranges) });
    }

    results.push({ path: doc.path, title: doc.title, kind: doc.kind, matches, score, hits, mtime: doc.mtime });
  }

  return results
    .sort((a, b) => b.score - a.score || b.mtime - a.mtime || a.path.localeCompare(b.path))
    .slice(0, limit);
}
