import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import type { Element, Root as HastRoot } from "hast";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { beforeAll, describe, expect, it } from "vitest";

import { CODE_THEME, CODE_TRANSFORMERS, languageForPath, loadHighlighter, rehypeCodeFence } from "@/lib/highlighter";

type Highlighter = NonNullable<Awaited<ReturnType<typeof loadHighlighter>>>;
let highlighter: Highlighter;

beforeAll(async () => {
  const loaded = await loadHighlighter();
  if (!loaded) throw new Error("highlighter failed to load");
  highlighter = loaded;
}, 30_000);

// Same rehype order as components/markdown-preview.tsx.
async function render(markdown: string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeCodeFence)
    // HighlighterCore is the same object, but its type doesn't match the plugin's generic signature.
    .use(rehypeShikiFromHighlighter, highlighter as Parameters<typeof rehypeShikiFromHighlighter>[0], {
      theme: CODE_THEME,
      transformers: CODE_TRANSFORMERS,
      defaultLanguage: "text",
      fallbackLanguage: "text",
    });
  const tree = (await processor.run(processor.parse(markdown))) as HastRoot;
  const pres: Element[] = [];
  visit(tree, "element", (node: Element) => {
    if (node.tagName === "pre") pres.push(node);
  });
  return { tree, pres };
}

const text = (node: Element | HastRoot): string =>
  node.children.map((c) => (c.type === "text" ? c.value : c.type === "element" ? text(c) : "")).join("");

// Shiki emits `class` strings; remark-rehype emits `className` arrays.
const classes = (node: Element): string[] => {
  const value = node.properties.className ?? node.properties.class;
  return Array.isArray(value) ? value.map(String) : String(value ?? "").split(/\s+/).filter(Boolean);
};

const lines = (pre: Element) => {
  const found: Element[] = [];
  visit(pre, "element", (node: Element) => {
    if (classes(node).includes("line")) found.push(node);
  });
  return found;
};

describe("note code blocks", () => {
  it("highlights known languages and exposes language, title, and line-number flags", async () => {
    const { pres } = await render('```python title="qc.py" showLineNumbers\nimport numpy as np\nx = np.log2(1)\n```');
    expect(pres).toHaveLength(1);
    expect(pres[0].properties).toMatchObject({ dataLanguage: "python", dataTitle: "qc.py", dataLineNumbers: "" });
    expect(pres[0].properties.style).toBeUndefined();
    const colors = new Set<string>();
    visit(pres[0], "element", (n: Element) => {
      const m = String(n.properties.style ?? "").match(/color:(#[0-9a-f]+)/i);
      if (m) colors.add(m[1]);
    });
    expect(colors.size).toBeGreaterThan(2);
    expect(text(pres[0])).toBe("import numpy as np\nx = np.log2(1)");
  });

  it("starts line numbers where showLineNumbers{n} says", async () => {
    const { pres } = await render('```python title="qc.py#L19-L20" showLineNumbers{19}\na = 1\nb = 2\n```');
    expect(pres[0].properties).toMatchObject({ dataTitle: "qc.py#L19-L20", dataLineNumbers: "", dataLineStart: "19" });
  });

  it("marks {n} meta lines and [!code ++/--] notation, removing the markers", async () => {
    const md = "```python {2}\na = 1\nb = 2\nc = 3  # [!code ++]\nd = 4  # [!code --]\n```";
    const { pres } = await render(md);
    const [a, b, c, d] = lines(pres[0]).map(classes);
    expect(a).not.toContain("highlighted");
    expect(b).toContain("highlighted");
    expect(c).toEqual(expect.arrayContaining(["diff", "add"]));
    expect(d).toEqual(expect.arrayContaining(["diff", "remove"]));
    expect(text(pres[0])).not.toContain("[!code");
  });

  it("keeps the written label for aliases and unknown languages, and handles unfenced blocks", async () => {
    const { pres } = await render("```snakemake\nrule all:\n```\n\n```wdl\ntask t {}\n```\n\n```\nplain\n```");
    expect(pres.map((p) => p.properties.dataLanguage)).toEqual(["snakemake", "wdl", undefined]);
  });

  it("leaves display math to KaTeX", async () => {
    const { tree, pres } = await render("$$\n\\hat\\beta = (X^\\top X)^{-1}X^\\top y\n$$");
    expect(pres).toHaveLength(0);
    let katex = false;
    visit(tree, "element", (n: Element) => {
      if (Array.isArray(n.properties.className) && n.properties.className.includes("katex-display")) katex = true;
    });
    expect(katex).toBe(true);
  });
});

describe("languageForPath", () => {
  it("maps research file types", () => {
    expect(languageForPath("pipelines/main.nf")).toBe("nextflow");
    expect(languageForPath("workflow/Snakefile")).toBe("python");
    expect(languageForPath("analysis/de.R")).toBe("r");
    expect(languageForPath("env/environment.yml")).toBe("yaml");
    expect(languageForPath("references.bib")).toBe("bibtex");
    expect(languageForPath("data/counts.tsv")).toBeNull();
    expect(languageForPath("README")).toBeNull();
  });
});
