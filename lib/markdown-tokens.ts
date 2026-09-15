// `[[wikilinks]]` and `#tags`: one tokenizer shared by the preview (as a remark
// plugin) and the server-side link index, so what renders as a link is exactly
// what counts as a backlink. Pure module: safe on client and server.

import type { Link, Nodes, Parent, Root, Text } from "mdast";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { SKIP, visitParents } from "unist-util-visit-parents";

export interface WikiLinkToken {
  type: "wikilink";
  raw: string;
  /** Note name or path as written, e.g. `papers/deseq2`. Never empty. */
  target: string;
  heading?: string;
  alias?: string;
}

export interface TagToken {
  type: "tag";
  raw: string;
  /** Lower-cased, without `#`; may be nested like `bio/rna-seq`. */
  tag: string;
}

export interface CitationItem {
  key: string;
  /** Text before the key, e.g. `see` in `[see @doe99]`. */
  prefix?: string;
  /** Text after the key, e.g. `p. 33` in `[@doe99, p. 33]`. */
  locator?: string;
  /** `[-@doe99]`: print only the year. */
  suppressAuthor: boolean;
}

export interface CitationToken {
  type: "citation";
  raw: string;
  items: CitationItem[];
}

export type Token = string | WikiLinkToken | TagToken | CitationToken;

// Alternatives, in order: [[wikilink]] | [@pandoc; @citation] | #tag.
// A tag needs a non-word character (or line start) before `#`, so URL
// fragments (`page#x`), `&#39;`, and `C#` don't count. Nested tags use `/`.
const TOKEN_RE =
  /\[\[([^[\]\n]+?)\]\]|\[([^[\]\n]*?-?@[\p{L}\p{N}_][^[\]\n]*)\]|(?<![\p{L}\p{N}_&/#])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu;

// Pandoc citekeys: letters, digits, `_`, and internal punctuation `:.#$%&-+?<>~/`.
const CITATION_ITEM_RE = /^(.*?)(?:^|(?<=[\s(]))(-?)@([\p{L}\p{N}_](?:[\p{L}\p{N}_:.#$%&+?<>~/-]*[\p{L}\p{N}_])?)(.*)$/u;

/** Parses the inside of `[...]`; null unless every `;`-separated part cites a key. */
export function parseCitation(inner: string): CitationItem[] | null {
  const items: CitationItem[] = [];
  for (const part of inner.split(";")) {
    const match = part.trim().match(CITATION_ITEM_RE);
    if (!match) return null;
    const [, prefix, dash, key, rest] = match;
    items.push({
      key,
      prefix: prefix.trim() || undefined,
      locator: rest.replace(/^[\s,.;:]+/, "").trim() || undefined,
      suppressAuthor: dash === "-",
    });
  }
  return items.length ? items : null;
}

function parseWikiInner(raw: string, inner: string): WikiLinkToken | null {
  const pipe = inner.indexOf("|");
  const ref = pipe === -1 ? inner : inner.slice(0, pipe);
  const alias = pipe === -1 ? undefined : inner.slice(pipe + 1).trim() || undefined;
  const hash = ref.indexOf("#");
  const target = (hash === -1 ? ref : ref.slice(0, hash)).trim();
  const heading = hash === -1 ? undefined : ref.slice(hash + 1).trim() || undefined;
  return target ? { type: "wikilink", raw, target, heading, alias } : null;
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, "").replace(/[/-]+$/, "").toLowerCase();
}

/** Splits plain text into strings and link/tag tokens. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const [raw, inner, citationInner, tagBody] = match;
    let token: Token | null = null;
    if (inner !== undefined) {
      token = parseWikiInner(raw, inner);
    } else if (citationInner !== undefined) {
      const items = parseCitation(citationInner);
      if (items) token = { type: "citation", raw, items };
    } else if (tagBody !== undefined) {
      const tag = normalizeTag(tagBody);
      // `#1` or `#2024` read as issue/number references, not tags.
      if (tag && !/^[\d/-]+$/.test(tag)) token = { type: "tag", raw: `#${tagBody.replace(/[/-]+$/, "")}`, tag };
    }
    if (!token) continue;
    const start = match.index;
    if (start > last) out.push(text.slice(last, start));
    out.push(token);
    last = start + token.raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Text under these nodes is literal: code, math, raw HTML, or already a link.
const LITERAL_ANCESTORS = new Set(["link", "linkReference", "code", "inlineCode", "math", "inlineMath", "html", "definition"]);

type TokenVisitor = (tokens: Token[], node: Text, parent: Parent) => void | number;

function visitTokens(tree: Root, visitor: TokenVisitor) {
  visitParents(tree, "text", (node, ancestors) => {
    if (ancestors.some((a) => LITERAL_ANCESTORS.has(a.type))) return;
    const tokens = tokenize(node.value);
    if (tokens.every((t) => typeof t === "string")) return;
    const next = visitor(tokens, node, ancestors.at(-1) as Parent);
    return typeof next === "number" ? [SKIP, next] : undefined;
  });
}

/**
 * Remark plugin: turns tokens into `link` nodes carrying data attributes that
 * the preview's `<a>` renderer resolves (`dataWikilink`, `dataTag`, `dataCitation`).
 */
export function remarkWikiTokens() {
  return (tree: Root) => {
    visitTokens(tree, (tokens, node, parent) => {
      const replacement: Nodes[] = tokens.map((t): Nodes => {
        if (typeof t === "string") return { type: "text", value: t };
        // hast property names are camelCase; they render as data-* attributes.
        const [label, hProperties] =
          t.type === "tag"
            ? [t.raw, { dataTag: t.tag }]
            : t.type === "citation"
              ? [t.raw, { dataCitation: t.raw.slice(1, -1) }]
              : [
                  t.alias ?? t.raw.slice(2, -2).split("|")[0],
                  { dataWikilink: t.target, dataHeading: t.heading ?? "", dataAlias: t.alias ?? "" },
                ];
        const link: Link = { type: "link", url: "", children: [{ type: "text", value: label }], data: { hProperties } };
        return link;
      });
      const index = parent.children.indexOf(node as never);
      parent.children.splice(index, 1, ...(replacement as never[]));
      return index + replacement.length;
    });
  };
}

export interface ExtractedLink {
  target: string;
  heading?: string;
  alias?: string;
  /** 1-based line in the note body (after frontmatter). */
  line: number;
  /** The source line, trimmed, for backlink snippets. */
  context: string;
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const MAX_CONTEXT = 240;

/** Outgoing wikilinks, inline tags, and cited keys of a note body. */
export function extractLinksAndTags(content: string): { links: ExtractedLink[]; tags: string[]; citations: string[] } {
  const tree = parser.parse(content);
  const lines = content.split(/\r?\n/);
  const links: ExtractedLink[] = [];
  const tags = new Set<string>();
  const citations = new Set<string>();

  visitTokens(tree, (tokens, node) => {
    let offset = 0;
    for (const t of tokens) {
      if (typeof t === "string") {
        offset += t.length;
        continue;
      }
      if (t.type === "tag") {
        tags.add(t.tag);
      } else if (t.type === "citation") {
        for (const item of t.items) citations.add(item.key);
      } else {
        const startLine = node.position?.start.line ?? 1;
        const line = startLine + (node.value.slice(0, offset).match(/\n/g)?.length ?? 0);
        const context = (lines[line - 1] ?? "").trim();
        links.push({
          target: t.target,
          heading: t.heading,
          alias: t.alias,
          line,
          context: context.length > MAX_CONTEXT ? `${context.slice(0, MAX_CONTEXT)}…` : context,
        });
      }
      offset += t.raw.length;
    }
  });

  return { links, tags: [...tags], citations: [...citations] };
}
