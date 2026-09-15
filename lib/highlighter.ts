// Shiki setup shared by note code blocks and the source viewer. Grammars load
// once, on first use, as separate chunks; after that highlighting is synchronous.

import { transformerMetaHighlight, transformerNotationDiff, transformerNotationHighlight } from "@shikijs/transformers";
import type { Element as HastElement, Root as HastRoot } from "hast";
import type { HighlighterCore, ShikiTransformer } from "shiki/core";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export const CODE_THEME = "github-dark-default";

// Research-oriented set: analysis languages, pipeline/config formats, and the
// systems languages tools are written in. Aliases (py, sh, yml, nf, ...) come
// free. A function rather than an array, since `import()` starts loading when evaluated.
const languages = () => [
  import("@shikijs/langs/python"),
  import("@shikijs/langs/r"),
  import("@shikijs/langs/julia"),
  import("@shikijs/langs/matlab"),
  import("@shikijs/langs/shellscript"),
  import("@shikijs/langs/sql"),
  import("@shikijs/langs/nextflow"),
  import("@shikijs/langs/groovy"),
  import("@shikijs/langs/yaml"),
  import("@shikijs/langs/json"),
  import("@shikijs/langs/jsonc"),
  import("@shikijs/langs/toml"),
  import("@shikijs/langs/ini"),
  import("@shikijs/langs/xml"),
  import("@shikijs/langs/csv"),
  import("@shikijs/langs/markdown"),
  import("@shikijs/langs/latex"),
  import("@shikijs/langs/bibtex"),
  import("@shikijs/langs/html"),
  import("@shikijs/langs/css"),
  import("@shikijs/langs/javascript"),
  import("@shikijs/langs/typescript"),
  import("@shikijs/langs/tsx"),
  import("@shikijs/langs/c"),
  import("@shikijs/langs/cpp"),
  import("@shikijs/langs/rust"),
  import("@shikijs/langs/go"),
  import("@shikijs/langs/java"),
  import("@shikijs/langs/perl"),
  import("@shikijs/langs/fortran-free-form"),
  import("@shikijs/langs/docker"),
  import("@shikijs/langs/makefile"),
  import("@shikijs/langs/cmake"),
  import("@shikijs/langs/diff"),
  import("@shikijs/langs/log"),
];

let highlighterPromise: Promise<HighlighterCore | null> | null = null;

/**
 * Memoized, so React's `use()` sees the same promise on every render. Resolves
 * to null if the grammar chunks fail to load; callers then render plain code.
 */
export function loadHighlighter(): Promise<HighlighterCore | null> {
  highlighterPromise ??= createHighlighterCore({
    themes: [import("@shikijs/themes/github-dark-default")],
    langs: languages(),
    // Pure-JS regex engine: no WebAssembly download, same output for these grammars.
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  }).catch((err) => {
    console.error("[highlighter] failed to load", err);
    return null;
  });
  return highlighterPromise;
}

const BY_FILENAME: Record<string, string> = {
  dockerfile: "docker",
  makefile: "makefile",
  "cmakelists.txt": "cmake",
  snakefile: "python",
  "nextflow.config": "nextflow",
};

const BY_EXTENSION: Record<string, string> = {
  py: "python", pyw: "python", smk: "python", ipynb: "json",
  r: "r", jl: "julia", m: "matlab",
  sh: "shellscript", bash: "shellscript", zsh: "shellscript",
  sql: "sql", nf: "nextflow", groovy: "groovy",
  yaml: "yaml", yml: "yaml", cwl: "yaml",
  json: "json", geojson: "json", jsonc: "jsonc", toml: "toml", ini: "ini", cfg: "ini", conf: "ini",
  xml: "xml", sbml: "xml", xsd: "xml", csv: "csv",
  md: "markdown", rmd: "markdown", qmd: "markdown", tex: "latex", sty: "latex", bib: "bibtex",
  html: "html", htm: "html", css: "css",
  js: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "tsx",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
  rs: "rust", go: "go", java: "java", pl: "perl", f90: "fortran-free-form",
  cmake: "cmake", diff: "diff", patch: "diff", log: "log",
};

/** Shiki language for a workspace file, or null to show it as plain text. */
export function languageForPath(path: string): string | null {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (BY_FILENAME[name]) return BY_FILENAME[name];
  const dot = name.lastIndexOf(".");
  return dot === -1 ? null : (BY_EXTENSION[name.slice(dot + 1)] ?? null);
}

// Fence names people write that aren't Shiki grammar names.
const FENCE_ALIASES: Record<string, string> = {
  snakemake: "python",
  jupyter: "python",
  ipython: "python",
  rscript: "r",
  console: "shellscript",
  terminal: "shellscript",
  cwl: "yaml",
};

const readMetaAttr = (raw: string, name: string) =>
  raw.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`))?.slice(1).find((v) => v !== undefined);

/**
 * Rehype plugin, run before Shiki: records each fence's language as written
 * (Shiki reports unknown ones as `text`) and maps common aliases to grammars.
 */
export function rehypeCodeFence() {
  return (tree: HastRoot) => {
    const walk = (node: HastRoot | HastElement) => {
      for (const child of node.children) {
        if (child.type !== "element") continue;
        const code = child.children[0];
        if (child.tagName === "pre" && code?.type === "element" && code.tagName === "code") {
          const classes = Array.isArray(code.properties.className) ? code.properties.className : [];
          const langClass = classes.find((c) => String(c).startsWith("language-"));
          if (langClass) {
            const written = String(langClass).slice("language-".length);
            const meta = (code.data as { meta?: string } | undefined)?.meta ?? "";
            code.data = { ...code.data, meta: `${meta} fence="${written.replace(/"/g, "")}"`.trim() } as never;
            const alias = FENCE_ALIASES[written.toLowerCase()];
            if (alias) code.properties.className = classes.map((c) => (c === langClass ? `language-${alias}` : c));
          }
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}

/**
 * Exposes the language and fence meta to the React code block as data
 * attributes, and lets the page's CSS own the block background:
 * ```python title="qc.py" showLineNumbers{10} {12-13}
 */
const transformerBlockMeta: ShikiTransformer = {
  name: "notate:block-meta",
  pre(node) {
    const raw = this.options.meta?.__raw ?? "";
    // hast property names are camelCase; they render as data-* attributes.
    const language = readMetaAttr(raw, "fence") ?? this.options.lang;
    if (language && language !== "text") node.properties.dataLanguage = language;
    const title = readMetaAttr(raw, "title");
    if (title) node.properties.dataTitle = title;
    const lineNumbers = raw.match(/\bshowLineNumbers(?:\{(\d+)\})?/);
    if (lineNumbers) {
      node.properties.dataLineNumbers = "";
      // `showLineNumbers{19}` numbers from 19, e.g. for snippets copied out of a file.
      if (lineNumbers[1]) node.properties.dataLineStart = lineNumbers[1];
    }
    delete node.properties.style;
  },
};

export const CODE_TRANSFORMERS: ShikiTransformer[] = [
  transformerBlockMeta,
  transformerMetaHighlight(), // {1,3-4} in the fence meta
  transformerNotationHighlight(), // // [!code highlight]
  transformerNotationDiff(), // // [!code ++] and // [!code --]
];
