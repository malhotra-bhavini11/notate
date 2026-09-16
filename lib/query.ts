// Frontmatter queries, e.g. `type:paper-review tag:scrna-seq -has:dataset sort:-year`.
// Pure and dependency-free: the server runs them, and the query page and note
// preview share the parser for errors and column names.

import { tagMatches } from "./link-resolver";

export type FieldOp = "eq" | "contains" | "gt" | "gte" | "lt" | "lte" | "range";

export type QueryTerm =
  /** `field:value`, `field:a,b` (any), `field:>=2020`, `field:~text`, `field:2019..2023`. */
  | { kind: "field"; field: string; op: FieldOp; values: string[]; negate: boolean }
  /** `has:field`, or `field:*`: present and not empty. */
  | { kind: "has"; field: string; negate: boolean }
  /** `in:papers`: notes in that folder or below. */
  | { kind: "in"; folder: string; negate: boolean }
  /** Bare words: anywhere in the title, path, or the note's text. */
  | { kind: "text"; value: string; negate: boolean };

export interface SortKey {
  field: string;
  desc: boolean;
}

export interface ParsedQuery {
  terms: QueryTerm[];
  sort: SortKey[];
  limit?: number;
  /** From `show:a,b`; otherwise derived from the fields the query mentions. */
  columns: string[];
  errors: string[];
}

/** A note as queries see it. `links` are resolved paths; `accessions` are `database:id` refs. */
export interface QueryableNote {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  citations: string[];
  accessions: string[];
  links: string[];
  /** The note's text, when the caller has it: bare words search this too. */
  text?: string;
  mtime: number;
}

/**
 * Fields computed from the note rather than read from frontmatter. They win
 * over a frontmatter key of the same name (`tags` includes inline #tags).
 */
export const VIRTUAL_FIELDS: Record<string, string> = {
  title: "Frontmatter title, or the file name",
  path: "Workspace path, e.g. papers/deseq2.md",
  tags: "Frontmatter and inline #tags; tag:bio matches bio/rna-seq",
  cites: "Citation keys cited with [@key]",
  mentions: "Database IDs in the text, e.g. GSE60450",
  links: "Notes and files linked with [[…]]",
  modified: "Last modified date, YYYY-MM-DD",
};

const ALIASES: Record<string, string> = { tag: "tags", cite: "cites", citations: "cites", mention: "mentions", ids: "mentions", link: "links", mtime: "modified" };

const DEFAULT_COLUMNS = ["type", "tags", "modified"];
const MAX_DEFAULT_COLUMNS = 6;
const FIELD_NAME = /^[A-Za-z_][\w.-]*$/;

const canonicalField = (name: string) => {
  const lower = name.toLowerCase();
  return ALIASES[lower] ?? lower;
};

interface RawToken {
  text: string;
  /** Index in `text` where the first quoted section starts, or -1. */
  quotedAt: number;
}

/** Splits on whitespace; `"…"` groups words and can appear after `field:`. */
function tokenize(input: string): RawToken[] {
  const tokens: RawToken[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length) break;
    let text = "";
    let quotedAt = -1;
    while (i < input.length && !/\s/.test(input[i])) {
      if (input[i] === '"') {
        const close = input.indexOf('"', i + 1);
        const end = close === -1 ? input.length : close;
        if (quotedAt === -1) quotedAt = text.length;
        text += input.slice(i + 1, end);
        i = end + 1;
      } else {
        text += input[i++];
      }
    }
    tokens.push({ text, quotedAt });
  }
  return tokens;
}

function parseValue(field: string, value: string, quoted: boolean, negate: boolean): QueryTerm {
  if (quoted) return { kind: "field", field, op: "eq", values: [value], negate };
  if (value === "*") return { kind: "has", field, negate };
  const comparison = value.match(/^(>=|<=|>|<)(.+)$/);
  if (comparison) {
    const op = ({ ">=": "gte", "<=": "lte", ">": "gt", "<": "lt" } as const)[comparison[1] as ">=" | "<=" | ">" | "<"];
    return { kind: "field", field, op, values: [comparison[2]], negate };
  }
  if (value.startsWith("~") && value.length > 1) return { kind: "field", field, op: "contains", values: [value.slice(1)], negate };
  const range = value.match(/^(.*?)\.\.(.*)$/);
  if (range && (range[1] || range[2])) {
    if (!range[2]) return { kind: "field", field, op: "gte", values: [range[1]], negate };
    if (!range[1]) return { kind: "field", field, op: "lte", values: [range[2]], negate };
    return { kind: "field", field, op: "range", values: [range[1], range[2]], negate };
  }
  const values = value.split(",").map((v) => v.trim()).filter(Boolean);
  return { kind: "field", field, op: "eq", values, negate };
}

export function parseQuery(input: string): ParsedQuery {
  const terms: QueryTerm[] = [];
  const sort: SortKey[] = [];
  const errors: string[] = [];
  let limit: number | undefined;
  let show: string[] | null = null;

  for (const { text, quotedAt } of tokenize(input)) {
    const negate = text.length > 1 && text.startsWith("-") && quotedAt !== 0;
    const body = negate ? text.slice(1) : text;
    const quoteOffset = quotedAt === -1 ? -1 : quotedAt - (negate ? 1 : 0);

    if (body.startsWith("#") && body.length > 1 && quoteOffset === -1) {
      terms.push({ kind: "field", field: "tags", op: "eq", values: [body.slice(1)], negate });
      continue;
    }

    const colon = body.indexOf(":");
    const key = colon > 0 ? body.slice(0, colon) : "";
    if (!key || !FIELD_NAME.test(key) || (quoteOffset !== -1 && quoteOffset <= colon)) {
      if (body) terms.push({ kind: "text", value: body, negate });
      continue;
    }

    const value = body.slice(colon + 1);
    const quoted = quoteOffset !== -1;
    const directive = key.toLowerCase();
    if (!value && !quoted) {
      errors.push(`\`${key}:\` needs a value`);
      continue;
    }

    if (directive === "sort" || directive === "limit" || directive === "show") {
      if (negate) errors.push(`\`${directive}:\` can't be negated`);
      if (directive === "limit") {
        const n = Number(value);
        if (Number.isInteger(n) && n > 0) limit = n;
        else errors.push(`\`limit:\` needs a positive whole number, not \`${value}\``);
      } else if (directive === "show") {
        show = [...(show ?? []), ...value.split(",").map((f) => f.trim()).filter(Boolean).map(canonicalField)];
      } else {
        for (const part of value.split(",").map((f) => f.trim()).filter(Boolean)) {
          const desc = part.startsWith("-") || /-desc$/i.test(part);
          const field = part.replace(/^-/, "").replace(/-(desc|asc)$/i, "");
          if (field) sort.push({ field: canonicalField(field), desc });
        }
      }
      continue;
    }

    if (directive === "has") {
      for (const field of value.split(",").map((f) => f.trim()).filter(Boolean)) {
        terms.push({ kind: "has", field: canonicalField(field), negate });
      }
      continue;
    }
    if (directive === "in") {
      terms.push({ kind: "in", folder: value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""), negate });
      continue;
    }

    const term = parseValue(canonicalField(key), value, quoted, negate);
    if (term.kind === "field" && term.values.length === 0) errors.push(`\`${key}:\` needs a value`);
    else terms.push(term);
  }

  return { terms, sort, limit, columns: show ?? defaultColumns(terms, sort), errors };
}

/** The fields a query filters or sorts on, so each row shows why it matched. */
function defaultColumns(terms: QueryTerm[], sort: SortKey[]): string[] {
  const fields = [
    ...terms.flatMap((t) => (t.kind === "field" || t.kind === "has" ? [t.field] : [])),
    ...sort.map((s) => s.field),
  ].filter((f) => f !== "title" && f !== "path");
  const unique = [...new Set(fields)];
  return unique.length ? unique.slice(0, MAX_DEFAULT_COLUMNS) : DEFAULT_COLUMNS;
}

function lookup(frontmatter: Record<string, unknown>, field: string): unknown {
  const find = (obj: unknown, key: string): unknown => {
    if (Array.isArray(obj)) return /^\d+$/.test(key) ? obj[Number(key)] : undefined;
    if (typeof obj !== "object" || obj === null) return undefined;
    const record = obj as Record<string, unknown>;
    if (key in record) return record[key];
    const match = Object.keys(record).find((k) => k.toLowerCase() === key);
    return match === undefined ? undefined : record[match];
  };
  // A literal `a.b` key wins over nesting.
  const direct = find(frontmatter, field);
  if (direct !== undefined || !field.includes(".")) return direct;
  return field.split(".").reduce<unknown>((obj, key) => find(obj, key), frontmatter);
}

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The raw value shown in a column: frontmatter as written, or the computed list. */
export function fieldValue(note: QueryableNote, field: string): unknown {
  switch (canonicalField(field)) {
    case "title":
      return note.title;
    case "path":
      return note.path;
    case "tags":
      return note.tags;
    case "cites":
      return note.citations;
    case "mentions":
      return note.accessions;
    case "links":
      return note.links;
    case "modified":
      return note.mtime;
    default:
      return lookup(note.frontmatter, canonicalField(field));
  }
}

/** Scalars to match against; empty when the field is missing or blank. */
function matchValues(note: QueryableNote, field: string): string[] {
  if (field === "modified") return [isoDate(note.mtime)];
  // Accession refs match on the ID alone: `mentions:GSE60450`.
  if (field === "mentions") return note.accessions.map((ref) => ref.slice(ref.indexOf(":") + 1));
  const flatten = (value: unknown): string[] => {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (typeof value === "object") return [];
    const text = String(value).trim();
    return text ? [text] : [];
  };
  return flatten(fieldValue(note, field));
}

function isPresent(note: QueryableNote, field: string): boolean {
  if (matchValues(note, field).length) return true;
  const value = fieldValue(note, field);
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length > 0;
}

const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Numbers compare numerically, everything else as case-insensitive text. A
 * value that starts with the query counts as equal, so `date:<=2026-09`
 * includes 2026-09-15 and `date:2026-01..2026-03` includes all of March.
 */
function compare(value: string, query: string): number {
  if (NUMBER.test(value) && NUMBER.test(query)) return Number(value) - Number(query);
  const a = value.toLowerCase();
  const b = query.toLowerCase();
  if (a.startsWith(b)) return 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

const wildcard = (pattern: string) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");

interface MatchContext {
  /** Resolves a `links:` value the same way `[[links]]` resolve. */
  resolve?: (target: string) => string | null;
}

function matchesField(note: QueryableNote, term: Extract<QueryTerm, { kind: "field" }>, ctx: MatchContext): boolean {
  const values = matchValues(note, term.field);
  const [q, q2] = term.values;
  switch (term.op) {
    case "contains":
      return values.some((v) => v.toLowerCase().includes(q.toLowerCase()));
    case "gt":
      return values.some((v) => compare(v, q) > 0);
    case "gte":
      return values.some((v) => compare(v, q) >= 0);
    case "lt":
      return values.some((v) => compare(v, q) < 0);
    case "lte":
      return values.some((v) => compare(v, q) <= 0);
    case "range":
      return values.some((v) => compare(v, q) >= 0 && compare(v, q2) <= 0);
    case "eq":
      return term.values.some((wanted) => {
        if (term.field === "tags") {
          const tag = wanted.replace(/^#/, "").toLowerCase();
          return tag.includes("*") ? values.some((v) => wildcard(tag).test(v)) : values.some((v) => tagMatches(v, tag));
        }
        if (term.field === "links") {
          const target = wanted.replace(/^\[\[|\]\]$/g, "");
          const resolved = ctx.resolve?.(target);
          if (resolved) return values.includes(resolved);
        }
        if (wanted.includes("*")) return values.some((v) => wildcard(wanted).test(v));
        return values.some((v) => v.toLowerCase() === wanted.toLowerCase());
      });
  }
}

function matchesTerm(note: QueryableNote, term: QueryTerm, ctx: MatchContext): boolean {
  let result: boolean;
  switch (term.kind) {
    case "field":
      result = matchesField(note, term, ctx);
      break;
    case "has":
      result = isPresent(note, term.field);
      break;
    case "in":
      result = !term.folder || note.path.toLowerCase().startsWith(`${term.folder.toLowerCase()}/`);
      break;
    case "text": {
      const q = term.value.toLowerCase();
      result =
        note.title.toLowerCase().includes(q) ||
        note.path.toLowerCase().includes(q) ||
        (note.text?.toLowerCase().includes(q) ?? false);
      break;
    }
  }
  return term.negate ? !result : result;
}

function sortValue(note: QueryableNote, field: string): string | number | null {
  if (field === "modified") return note.mtime;
  const [first] = matchValues(note, field);
  if (first === undefined) return null;
  return NUMBER.test(first) ? Number(first) : first;
}

function compareNotes(a: QueryableNote, b: QueryableNote, sort: SortKey[]): number {
  for (const { field, desc } of sort) {
    const va = sortValue(a, field);
    const vb = sortValue(b, field);
    if (va === vb) continue;
    // Missing values go last whichever way the sort runs.
    if (va === null) return 1;
    if (vb === null) return -1;
    const diff =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
    if (diff !== 0) return desc ? -diff : diff;
  }
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
}

export interface QueryRow {
  path: string;
  title: string;
  values: Record<string, unknown>;
}

export interface QueryResult {
  columns: string[];
  rows: QueryRow[];
  /** Matches before `limit`. */
  total: number;
  errors: string[];
}

/** Hard cap so a query matching the whole workspace can't render thousands of rows. */
export const MAX_ROWS = 500;

export function runQuery(query: ParsedQuery, notes: QueryableNote[], ctx: MatchContext = {}): QueryResult {
  const matched = notes.filter((note) => query.terms.every((term) => matchesTerm(note, term, ctx)));
  const sort = query.sort.length ? query.sort : [{ field: "modified", desc: true }];
  matched.sort((a, b) => compareNotes(a, b, sort));
  const shown = matched.slice(0, Math.min(query.limit ?? MAX_ROWS, MAX_ROWS));
  return {
    columns: query.columns,
    rows: shown.map((note) => ({
      path: note.path,
      title: note.title,
      values: Object.fromEntries(query.columns.map((c) => [c, fieldValue(note, c)])),
    })),
    total: matched.length,
    errors: query.errors,
  };
}

/** Plain-text form of a cell, for CSV and tooltips. */
export function cellText(column: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (canonicalField(column) === "modified" && typeof value === "number") return isoDate(value);
  if (canonicalField(column) === "mentions" && Array.isArray(value)) {
    return value.map((ref) => String(ref).slice(String(ref).indexOf(":") + 1)).join("; ");
  }
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v))).join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function resultToCsv(result: QueryResult): string {
  const escape = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  const header = ["title", "path", ...result.columns];
  const lines = result.rows.map((row) =>
    [row.title, row.path, ...result.columns.map((c) => cellText(c, row.values[c]))].map(escape).join(","),
  );
  return [header.map(escape).join(","), ...lines].join("\n") + "\n";
}

/** Replaces any `sort:` in the query text, e.g. when a column header is clicked. */
export function withSort(input: string, field: string, desc: boolean): string {
  const rest = tokenize(input)
    .filter(({ text }) => !/^sort:/i.test(text))
    .map(({ text, quotedAt }) => {
      if (quotedAt === -1) return text;
      return `${text.slice(0, quotedAt)}"${text.slice(quotedAt)}"`;
    });
  return [...rest, `sort:${desc ? "-" : ""}${field}`].join(" ");
}

/** Frontmatter keys across notes with how many notes set them, most common first. */
export function countFields(frontmatters: Record<string, unknown>[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const fm of frontmatters) {
    for (const [key, value] of Object.entries(fm)) {
      const blank = value === null || value === "" || (Array.isArray(value) && value.length === 0);
      if (!blank) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
