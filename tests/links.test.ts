import { describe, expect, it } from "vitest";

import { createResolver, tagMatches } from "@/lib/link-resolver";
import { extractLinksAndTags, tokenize } from "@/lib/markdown-tokens";

describe("tokenize", () => {
  it("parses wikilink targets, headings, and aliases", () => {
    expect(tokenize("see [[DESeq2 notes#Methods|the model]] now")).toEqual([
      "see ",
      { type: "wikilink", raw: "[[DESeq2 notes#Methods|the model]]", target: "DESeq2 notes", heading: "Methods", alias: "the model" },
      " now",
    ]);
    expect(tokenize("[[#only-heading]]")).toEqual(["[[#only-heading]]"]);
  });

  it("finds tags but not URL fragments, numbers, or entities", () => {
    const tags = (s: string) => tokenize(s).flatMap((t) => (typeof t === "object" && t.type === "tag" ? [t.tag] : []));
    expect(tags("#RNA-seq and #bio/single-cell, (#stats).")).toEqual(["rna-seq", "bio/single-cell", "stats"]);
    expect(tags("page#section issue #42 C# a&#b")).toEqual([]);
    expect(tags("trailing #tag- dash")).toEqual(["tag"]);
    expect(tags("unicode #données")).toEqual(["données"]);
  });
});

describe("extractLinksAndTags", () => {
  const body = [
    "# Heading is not a tag",
    "",
    "Links to [[deseq2-love-2014]] and #rna-seq.",
    "",
    "```python",
    "x = '[[not-a-link]]'  # comment #notatag",
    "```",
    "",
    "Inline `[[nope]]` and math $a \\# b$ and <https://x.org/#frag>.",
    "",
    "| Paper | Link |",
    "|---|---|",
    "| DESeq2 | [[papers/deseq2\\|DESeq2]] #table-tag |",
    "",
    "Soft wrapped paragraph with a link",
    "on the next line [[Second Line]].",
  ].join("\n");

  it("skips code, inline code, math, and autolinks", () => {
    const { links, tags } = extractLinksAndTags(body);
    expect(links.map((l) => l.target)).toEqual(["deseq2-love-2014", "papers/deseq2", "Second Line"]);
    expect(tags.sort()).toEqual(["rna-seq", "table-tag"]);
  });

  it("reports the source line and context for each link", () => {
    const { links } = extractLinksAndTags(body);
    expect(links[0]).toMatchObject({ line: 3, context: "Links to [[deseq2-love-2014]] and #rna-seq." });
    expect(links[1]).toMatchObject({ alias: "DESeq2", line: 13 });
    expect(links[2]).toMatchObject({ line: 16, context: "on the next line [[Second Line]]." });
  });
});

describe("createResolver", () => {
  const resolve = createResolver([
    { path: "papers/deseq2-love-2014.md", title: "DESeq2 – Moderated estimation" },
    { path: "papers/index.md" },
    { path: "code-reviews/index.md" },
    { path: "index.md" },
    { path: "papers/notate-sample.pdf" },
    { path: "math/Strong Law.md", title: "SLLN" },
  ]);

  it("matches by file name, title, and slug, case-insensitively", () => {
    expect(resolve("deseq2-love-2014")).toBe("papers/deseq2-love-2014.md");
    expect(resolve("DESEQ2-LOVE-2014.md")).toBe("papers/deseq2-love-2014.md");
    expect(resolve("DESeq2 – Moderated estimation")).toBe("papers/deseq2-love-2014.md");
    expect(resolve("slln")).toBe("math/Strong Law.md");
    expect(resolve("Strong Law")).toBe("math/Strong Law.md");
    expect(resolve("DESeq2 Love 2014")).toBe("papers/deseq2-love-2014.md");
  });

  it("resolves paths absolutely or relative to the linking note", () => {
    expect(resolve("papers/index")).toBe("papers/index.md");
    expect(resolve("/code-reviews/index.md")).toBe("code-reviews/index.md");
  });

  it("breaks ties by the linking note's folder, then depth", () => {
    expect(resolve("index")).toBe("index.md");
    expect(resolve("index", "papers/deseq2-love-2014.md")).toBe("papers/index.md");
    expect(resolve("index", "code-reviews/other.md")).toBe("code-reviews/index.md");
  });

  it("only links non-note files when the extension is given", () => {
    expect(resolve("notate-sample")).toBeNull();
    expect(resolve("notate-sample.pdf")).toBe("papers/notate-sample.pdf");
    expect(resolve("missing note")).toBeNull();
  });
});

describe("tagMatches", () => {
  it("includes nested tags under a parent", () => {
    expect(tagMatches("bio/rna-seq", "bio")).toBe(true);
    expect(tagMatches("biology", "bio")).toBe(false);
  });
});
