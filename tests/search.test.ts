import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseSearch, type SearchDoc, searchDocs } from "@/lib/search";

const doc = (overrides: Partial<SearchDoc> & { path: string; text: string }): SearchDoc => ({
  title: overrides.path,
  kind: "note",
  bodyOffset: 0,
  mtime: 1,
  ...overrides,
});

const DOCS: SearchDoc[] = [
  doc({
    path: "papers/deseq2.md",
    title: "DESeq2",
    text: "---\ntitle: DESeq2\n---\n\nShrinking dispersion estimates.\nRaw counts only; never normalised input.\n",
    bodyOffset: 3,
    mtime: 30,
  }),
  doc({
    path: "papers/edger.md",
    title: "edgeR",
    text: "Dispersion is estimated per gene.\nAlso deprecated in our pipeline.\n",
    mtime: 20,
  }),
  doc({ path: "pipelines/qc.py", title: "qc.py", kind: "file", text: "MIN_COUNT = 10  # raw counts\n", mtime: 10 }),
  doc({ path: "guides/counts.md", title: "Counts guide", text: "Everything about read tables.\n", mtime: 5 }),
];

const run = (query: string) => searchDocs(DOCS, parseSearch(query)).map((r) => r.path);

describe("parseSearch", () => {
  it("splits words, keeps phrases whole, and reads exclusions", () => {
    expect(parseSearch('dispersion "raw counts" -deprecated').terms).toEqual([
      { text: "dispersion", negate: false },
      { text: "raw counts", negate: false },
      { text: "deprecated", negate: true },
    ]);
    expect(parseSearch("Raw RAW raw").terms).toHaveLength(1);
    expect(parseSearch("  ").terms).toEqual([]);
    expect(parseSearch("-only").empty).toBe(true);
  });
});

describe("searchDocs", () => {
  it("requires every term, ignoring case, and honours exclusions", () => {
    expect(run("dispersion")).toEqual(["papers/deseq2.md", "papers/edger.md"]);
    expect(run("dispersion -deprecated")).toEqual(["papers/deseq2.md"]);
    expect(run("dispersion gene")).toEqual(["papers/edger.md"]);
    expect(run("dispersion nonsense")).toEqual([]);
    expect(run("")).toEqual([]);
  });

  it("matches phrases as written, not as separate words", () => {
    expect(run('"raw counts"')).toEqual(["papers/deseq2.md", "pipelines/qc.py"]);
    expect(run('"counts raw"')).toEqual([]);
  });

  it("matches the title and path as well as the text", () => {
    expect(run("edger")).toEqual(["papers/edger.md"]);
    expect(run("pipelines")).toEqual(["pipelines/qc.py"]);
  });

  it("ranks a title match above a match in the text", () => {
    const results = searchDocs(DOCS, parseSearch("counts"));
    expect(results.map((r) => r.path)).toEqual(["guides/counts.md", "papers/deseq2.md", "pipelines/qc.py"]);
    // A document matched only by its title or path has no lines to show.
    expect(results[0]).toMatchObject({ matches: 0, hits: [] });
    expect(results[0].score).toBeGreaterThan(results[1].score);
    // Same score: the more recently edited note comes first.
    expect(results[1].score).toBe(results[2].score);
  });

  it("returns each matching line with ranges to highlight, and a body-relative line", () => {
    const [result] = searchDocs(DOCS, parseSearch("dispersion"), { limit: 1 });
    expect(result.hits).toEqual([
      { line: 5, bodyLine: 2, text: "Shrinking dispersion estimates.", ranges: [[10, 20]] },
    ]);
  });

  it("caps the lines shown per document and trims long ones around the match", () => {
    const long = doc({ path: "long.md", text: `${"filler ".repeat(60)}needle${" tail".repeat(60)}\nneedle\nneedle\nneedle\n` });
    const [result] = searchDocs([long], parseSearch("needle"), { hitsPerDoc: 2 });
    expect(result.matches).toBe(4);
    expect(result.hits).toHaveLength(2);
    expect(result.hits[0].text.length).toBeLessThanOrEqual(200);
    expect(result.hits[0]).toMatchObject({ trimmedStart: true, trimmedEnd: true });
    const [start, end] = result.hits[0].ranges[0];
    expect(result.hits[0].text.slice(start, end)).toBe("needle");
  });
});

describe("workspace search", () => {
  let root: string;
  let index: typeof import("@/lib/search-index");

  beforeAll(async () => {
    root = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "notate-search-")), "workspace");
    process.env.WORKSPACE_DIR = root;
    await fs.mkdir(path.join(root, "papers"), { recursive: true });
    await fs.writeFile(path.join(root, "papers", "note.md"), "---\ntitle: Counts\n---\n\nDispersion shrinkage.\n");
    await fs.writeFile(path.join(root, "qc.py"), "threshold = 10  # dispersion\n");
    await fs.writeFile(path.join(root, "photo.png"), Buffer.from([0x89, 0x50, 0x00, 0x47]));
    index = await import("@/lib/search-index");
  });

  afterAll(async () => {
    await fs.rm(path.dirname(root), { recursive: true, force: true });
  });

  it("searches notes and code, skips binaries, and titles each result", async () => {
    const results = await index.search("dispersion");
    // Equal scores, so the order here is by mtime; check the set and the titles.
    expect(results.map((r) => [r.path, r.title, r.kind]).sort()).toEqual([
      ["papers/note.md", "Counts", "note"],
      ["qc.py", "qc.py", "file"],
    ]);
    // Frontmatter counts as part of the file, so hits keep file line numbers.
    const note = results.find((r) => r.kind === "note")!;
    expect(note.hits[0]).toMatchObject({ line: 5, bodyLine: 2 });
    expect(await index.search("photo")).toHaveLength(0);
  });

  it("picks up edits and deletions on the next search", async () => {
    await new Promise((r) => setTimeout(r, 20)); // ensure a distinct mtime
    await fs.writeFile(path.join(root, "qc.py"), "threshold = 10  # variance\n");
    expect((await index.search("dispersion")).map((r) => r.path)).toEqual(["papers/note.md"]);
    await fs.rm(path.join(root, "papers", "note.md"));
    expect(await index.search("dispersion")).toEqual([]);
  });
});
