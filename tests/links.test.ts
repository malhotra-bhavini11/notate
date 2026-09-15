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

describe("citations", () => {
  const cites = (s: string) => tokenize(s).flatMap((t) => (typeof t === "object" && t.type === "citation" ? [t.items] : []));

  it("parses pandoc-style citations with locators, prefixes, and suppressed authors", () => {
    expect(cites("As shown [@love2014moderated, p. 3].")).toEqual([
      [{ key: "love2014moderated", locator: "p. 3", suppressAuthor: false }],
    ]);
    expect(cites("[see @doe99, pp. 33-35; also -@smith04]")).toEqual([
      [
        { key: "doe99", prefix: "see", locator: "pp. 33-35", suppressAuthor: false },
        { key: "smith04", prefix: "also", suppressAuthor: true },
      ],
    ]);
    expect(cites("[@Vaswani2017.]")).toEqual([[{ key: "Vaswani2017", suppressAuthor: false }]]);
  });

  it("ignores emails, plain brackets, and parts without a key", () => {
    expect(cites("[mail me@example.org] [a note] [@ok; not a key]")).toEqual([]);
  });

  it("is extracted from notes but not from code or links", () => {
    const { citations } = extractLinksAndTags(
      "Text [@love2014moderated; @vaswani2017attention].\n\n`[@code]` and [@linked](https://x.org)\n\n```\n[@block]\n```",
    );
    expect(citations).toEqual(["love2014moderated", "vaswani2017attention"]);
  });
});

describe("accessions in notes", () => {
  it("are found in prose but not in code, math, links, wikilinks, citations, or tags", () => {
    const { accessions, links, tags } = extractLinksAndTags(
      [
        "Counts from GSE60450 (runs SRR1552450); p53 is P04637 and TP53 is ENSG00000141510.",
        "",
        "`GSE11111` and ```GSE22222``` inline, $GSE33333$ math, [GSE44444](https://example.org) link.",
        "",
        "[[GSE55555]] note link, [@GSE66666] citation, #GSE77777 tag.",
      ].join("\n"),
    );
    expect(accessions).toEqual(["geo:GSE60450", "sra:SRR1552450", "uniprot:P04637", "ensembl:ENSG00000141510"]);
    expect(links.map((l) => l.target)).toEqual(["GSE55555"]);
    expect(tags).toEqual(["gse77777"]);
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
