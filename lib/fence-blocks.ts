// Fences the preview renders itself rather than as code: ```query tables and
// ```mermaid diagrams. Runs before the highlighter, which then skips them.

import type { Element as HastElement, Properties, Root as HastRoot } from "hast";

/** `title="…"` in the fence meta, e.g. ```mermaid title="Pipeline DAG". */
const metaTitle = (meta: string) => meta.match(/\btitle=(?:"([^"]*)"|'([^']*)')/)?.slice(1).find((v) => v !== undefined);

const FENCES: Record<string, (code: string, title?: string) => Properties> = {
  query: (code, title) => ({ dataQuery: code, ...(title ? { dataQueryTitle: title } : {}) }),
  mermaid: (code, title) => ({ dataMermaid: code, ...(title ? { dataMermaidTitle: title } : {}) }),
};

/** Replaces those fences with an empty `<div>` carrying the source as a data attribute. */
export function rehypeFenceBlocks() {
  return (tree: HastRoot) => {
    const walk = (node: HastRoot | HastElement) => {
      node.children.forEach((child, i) => {
        if (child.type !== "element") return;
        const code = child.children[0];
        if (child.tagName !== "pre" || code?.type !== "element" || code.tagName !== "code") {
          walk(child);
          return;
        }
        const classes = Array.isArray(code.properties.className) ? code.properties.className : [];
        const language = classes.map(String).find((c) => c.startsWith("language-"))?.slice("language-".length) ?? "";
        const build = FENCES[language.toLowerCase()];
        if (!build) return;
        const source = code.children.map((c) => (c.type === "text" ? c.value : "")).join("").trim();
        const meta = (code.data as { meta?: string } | undefined)?.meta ?? "";
        node.children[i] = { type: "element", tagName: "div", properties: build(source, metaTitle(meta)), children: [] };
      });
    };
    walk(tree);
  };
}
