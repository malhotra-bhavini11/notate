// Callout blocks: `> [!theorem] Pythagoras`, `> [!warning]`, `> [!proof]`.
// GitHub's admonition syntax, extended with the LaTeX-style environments that
// maths and methods notes need. Pure, so the parser can be tested on its own.

import type { Paragraph, Parent, Root } from "mdast";

/** Colour bundles, so Tailwind sees whole class names. */
export type CalloutColor = "indigo" | "violet" | "sky" | "emerald" | "amber" | "rose" | "zinc";

export interface CalloutType {
  label: string;
  color: CalloutColor;
  /** Counted per note, e.g. "Theorem 2". */
  numbered?: boolean;
  /** Statement environments are set in italics, as in a paper. */
  italic?: boolean;
  /** Ends with ∎. */
  qed?: boolean;
}

export const CALLOUT_TYPES: Record<string, CalloutType> = {
  theorem: { label: "Theorem", color: "indigo", numbered: true, italic: true },
  lemma: { label: "Lemma", color: "indigo", numbered: true, italic: true },
  proposition: { label: "Proposition", color: "indigo", numbered: true, italic: true },
  corollary: { label: "Corollary", color: "indigo", numbered: true, italic: true },
  conjecture: { label: "Conjecture", color: "indigo", numbered: true, italic: true },
  definition: { label: "Definition", color: "violet", numbered: true },
  proof: { label: "Proof", color: "zinc", qed: true },
  example: { label: "Example", color: "emerald", numbered: true },
  remark: { label: "Remark", color: "zinc", numbered: true },
  note: { label: "Note", color: "sky" },
  tip: { label: "Tip", color: "emerald" },
  important: { label: "Important", color: "violet" },
  warning: { label: "Warning", color: "amber" },
  caution: { label: "Caution", color: "rose" },
  question: { label: "Question", color: "sky" },
  todo: { label: "To do", color: "zinc" },
  abstract: { label: "Abstract", color: "zinc" },
  quote: { label: "Quote", color: "zinc" },
  bug: { label: "Bug", color: "rose" },
};

const ALIASES: Record<string, string> = {
  info: "note",
  hint: "tip",
  attention: "warning",
  danger: "caution",
  error: "caution",
  faq: "question",
  summary: "abstract",
  tldr: "abstract",
  cite: "quote",
  claim: "proposition",
  thm: "theorem",
  defn: "definition",
  eg: "example",
};

export const calloutType = (name: string): string | null => {
  const key = ALIASES[name.toLowerCase()] ?? name.toLowerCase();
  return key in CALLOUT_TYPES ? key : null;
};

export interface CalloutMarker {
  type: string;
  title: string;
  /** `-` starts collapsed, `+` collapsible but open, none means not collapsible. */
  fold: "-" | "+" | null;
  /** Characters consumed from the start of the blockquote's first line. */
  length: number;
}

const MARKER = /^\[!([A-Za-z-]+)\]([+-]?)[ \t]*([^\n]*)(\n?)/;

/** Reads `[!type]± Title` at the start of a blockquote; null if it isn't a callout. */
export function parseCalloutMarker(text: string): CalloutMarker | null {
  const match = text.match(MARKER);
  if (!match) return null;
  const type = calloutType(match[1]);
  if (!type) return null;
  return { type, title: match[3].trim(), fold: (match[2] || null) as "-" | "+" | null, length: match[0].length };
}

/**
 * Remark plugin: tags blockquotes that open with a callout marker, strips the
 * marker, and numbers theorem-like types in document order. The preview reads
 * the data attributes; anything else renders it as a plain blockquote.
 */
export function remarkCallouts() {
  return (tree: Root) => {
    const counters = new Map<string, number>();

    const walk = (node: Parent) => {
      for (const child of node.children) {
        if (!("children" in child)) continue;
        if (child.type !== "blockquote") {
          walk(child as Parent);
          continue;
        }
        const paragraph = child.children[0] as Paragraph | undefined;
        const first = paragraph?.type === "paragraph" ? paragraph.children[0] : undefined;
        const marker = first?.type === "text" ? parseCalloutMarker(first.value) : null;
        if (!marker || first?.type !== "text") {
          walk(child);
          continue;
        }

        first.value = first.value.slice(marker.length);
        // Drop the now-empty node, and the paragraph with it if nothing is left.
        if (!first.value) {
          paragraph!.children.shift();
          if (paragraph!.children.length === 0) child.children.shift();
        }

        const definition = CALLOUT_TYPES[marker.type];
        const number = definition.numbered ? (counters.get(marker.type) ?? 0) + 1 : undefined;
        if (number) counters.set(marker.type, number);

        child.data = {
          ...child.data,
          hName: "aside",
          hProperties: {
            dataCallout: marker.type,
            ...(marker.title ? { dataCalloutTitle: marker.title } : {}),
            ...(number ? { dataCalloutNumber: String(number) } : {}),
            ...(marker.fold ? { dataCalloutFold: marker.fold } : {}),
          },
        };
        walk(child);
      }
    };

    walk(tree);
  };
}
