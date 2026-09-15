import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getBacklinks, getIndexDTO } from "@/lib/link-index";
import { WorkspaceError } from "@/lib/workspace";

let root: string;
const write = async (rel: string, text: string) => {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, text);
};

beforeAll(async () => {
  root = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "notate-links-")), "workspace");
  process.env.WORKSPACE_DIR = root;
  await write("papers/deseq2.md", "---\ntitle: DESeq2\ntags: [RNA-seq]\n---\nModel notes. #stats\n");
  await write("papers/paper.pdf", "%PDF-1.4");
  await write("reviews/pipeline.md", "Uses [[DESeq2]] for DE.\n\nAlso [[deseq2|the paper]] and [[paper.pdf]].\n");
  await write("ideas.md", "---\ntitle: Ideas\n---\nCompare with [[papers/deseq2]] #stats/bayes\n\n`[[deseq2]]` in code\n");
  await write("broken.md", "---\ntitle: [unclosed\n---\nStill links [[DESeq2]]\n");
});

afterAll(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true });
});

describe("getBacklinks", () => {
  it("collects every resolving mention with its line, skipping code", async () => {
    const backlinks = await getBacklinks(["papers", "deseq2.md"]);
    expect(backlinks.map((b) => b.path)).toEqual(["broken.md", "ideas.md", "reviews/pipeline.md"]);
    expect(backlinks.find((b) => b.path === "reviews/pipeline.md")!.mentions).toEqual([
      { line: 1, context: "Uses [[DESeq2]] for DE." },
      { line: 3, context: "Also [[deseq2|the paper]] and [[paper.pdf]]." },
    ]);
    // Line numbers count the frontmatter, matching the file as opened elsewhere.
    expect(backlinks.find((b) => b.path === "ideas.md")!.mentions).toEqual([
      { line: 4, context: "Compare with [[papers/deseq2]] #stats/bayes" },
    ]);
    expect(backlinks.find((b) => b.path === "broken.md")!.mentions[0].line).toBe(4);
  });

  it("works for non-note files and 404s for missing ones", async () => {
    expect((await getBacklinks(["papers", "paper.pdf"])).map((b) => b.path)).toEqual(["reviews/pipeline.md"]);
    await expect(getBacklinks(["nope.md"])).rejects.toBeInstanceOf(WorkspaceError);
  });

  it("picks up edits on the next call", async () => {
    await new Promise((r) => setTimeout(r, 20)); // ensure a distinct mtime
    await write("ideas.md", "---\ntitle: Ideas\n---\nNo links any more.\n");
    expect((await getBacklinks(["papers", "deseq2.md"])).map((b) => b.path)).not.toContain("ideas.md");
  });
});

describe("getIndexDTO", () => {
  it("merges frontmatter and inline tags and lists linkable files", async () => {
    const index = await getIndexDTO();
    expect(index.notes.find((n) => n.path === "papers/deseq2.md")!.tags.sort()).toEqual(["rna-seq", "stats"]);
    expect(index.files).toEqual(["papers/paper.pdf"]);
    expect(index.tags.find((t) => t.tag === "stats")).toEqual({ tag: "stats", count: 1 });
    expect(index.notes.find((n) => n.path === "broken.md")!.title).toBe("broken");
  });
});

describe("anchored backlinks", () => {
  it("keeps the #anchor of links into files", async () => {
    await write("notes/review.md", "Filter bug at [[paper.pdf#page=2]] and again [[papers/paper.pdf]].\n");
    const backlinks = await getBacklinks(["papers", "paper.pdf"]);
    expect(backlinks.find((b) => b.path === "notes/review.md")!.mentions).toEqual([
      { line: 1, context: "Filter bug at [[paper.pdf#page=2]] and again [[papers/paper.pdf]].", heading: "page=2" },
      { line: 1, context: "Filter bug at [[paper.pdf#page=2]] and again [[papers/paper.pdf]]." },
    ]);
  });
});
