import { describe, expect, it } from "vitest";

import { generateCitekey } from "@/lib/citations/citekey";
import { parseIdentifier } from "@/lib/citations/identifiers";
import { buildReadingNote, readingNotePath } from "@/lib/citations/reading-note";
import type { ReferenceDTO } from "@/lib/types";

describe("parseIdentifier", () => {
  it.each([
    ["10.1186/s13059-014-0550-8", { kind: "doi", value: "10.1186/s13059-014-0550-8" }],
    ["doi: 10.1186/S13059-014-0550-8.", { kind: "doi", value: "10.1186/s13059-014-0550-8" }],
    ["https://doi.org/10.1038/nmeth.3317", { kind: "doi", value: "10.1038/nmeth.3317" }],
    ["https://dx.doi.org/10.1002%2Fbimj.4710280102", { kind: "doi", value: "10.1002/bimj.4710280102" }],
    ["https://link.springer.com/article/10.1186/s13059-014-0550-8", { kind: "doi", value: "10.1186/s13059-014-0550-8" }],
    ["https://www.biorxiv.org/content/10.1101/2020.03.22.002386v3.full", { kind: "doi", value: "10.1101/2020.03.22.002386" }],
    ["25516281", { kind: "pmid", value: "25516281" }],
    ["PMID: 25516281", { kind: "pmid", value: "25516281" }],
    ["https://pubmed.ncbi.nlm.nih.gov/25516281/", { kind: "pmid", value: "25516281" }],
    ["pmc4302049", { kind: "pmcid", value: "PMC4302049" }],
    ["https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4302049/", { kind: "pmcid", value: "PMC4302049" }],
    ["1706.03762v7", { kind: "arxiv", value: "1706.03762" }],
    ["arXiv:2401.12345", { kind: "arxiv", value: "2401.12345" }],
    ["https://arxiv.org/pdf/1706.03762v7.pdf", { kind: "arxiv", value: "1706.03762" }],
    ["https://arxiv.org/abs/q-bio/0512025", { kind: "arxiv", value: "q-bio/0512025" }],
    ["10.48550/arXiv.1706.03762", { kind: "arxiv", value: "1706.03762" }],
  ])("%s", (input, expected) => {
    expect(parseIdentifier(input)).toEqual(expected);
  });

  it.each(["", "hello world", "https://example.com/paper", "doi: not-a-doi", "PMID: abc", "ftp://doi.org/10.1/x"])(
    "rejects %j",
    (input) => {
      expect(parseIdentifier(input)).toBeNull();
    },
  );
});

describe("buildReadingNote", () => {
  const ref: ReferenceDTO = {
    key: "love2014moderated",
    type: "article-journal",
    title: "Moderated estimation of fold change",
    authors: ["Love, Michael I", "Huber, Wolfgang"],
    year: 2014,
    container: "Genome Biology",
    doi: "10.1186/s13059-014-0550-8",
    abstract: "In comparative high-throughput sequencing assays…",
    formatted: "",
    inText: "Love et al., 2014",
    bibtex: "",
  };

  it("fills the paper-review template with citation metadata and the abstract", () => {
    const note = buildReadingNote(ref, "2026-09-15");
    expect(readingNotePath(ref.key)).toBe("papers/love2014moderated.md");
    expect(Object.keys(note.frontmatter!).slice(0, 3)).toEqual(["title", "citekey", "authors"]);
    expect(note.frontmatter).toMatchObject({
      citekey: "love2014moderated",
      authors: ["Love, Michael I", "Huber, Wolfgang"],
      year: 2014,
      journal: "Genome Biology",
      doi: "10.1186/s13059-014-0550-8",
      type: "paper-review",
      date: "2026-09-15",
    });
    // Undefined metadata (no PMID/arXiv here) is left out rather than written as null.
    expect(note.frontmatter).not.toHaveProperty("pmid");
    expect(note.content.startsWith("# Moderated estimation of fold change\n\n[@love2014moderated]\n\n## Abstract\n")).toBe(true);
    expect(note.content).toContain("## Research question");
  });

  it("turns unusual keys into safe file names", () => {
    expect(readingNotePath("doe:2020/a b")).toBe("papers/doe-2020-a-b.md");
  });
});

describe("generateCitekey", () => {
  it("builds author + year + first significant title word", () => {
    expect(
      generateCitekey({ familyName: "Love", year: 2014, title: "Moderated estimation of fold change and dispersion" }),
    ).toBe("love2014moderated");
    // Diacritics are stripped (ü → u) and the leading stop word skipped.
    expect(generateCitekey({ familyName: "Müller-Lüdenscheidt", year: 2020, title: "The RNA-seq of things" })).toBe(
      "mullerludenscheidt2020rna",
    );
    expect(generateCitekey({ title: "A study" })).toBe("anonstudy");
  });

  it("adds a letter suffix when the key is taken", () => {
    const parts = { familyName: "Love", year: 2014, title: "Moderated estimation" };
    expect(generateCitekey(parts, ["Love2014Moderated"])).toBe("love2014moderateda");
    expect(generateCitekey(parts, ["love2014moderated", "love2014moderateda"])).toBe("love2014moderatedb");
  });
});
