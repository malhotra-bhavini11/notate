import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseMarkdown, stringifyMarkdown } from "@/lib/frontmatter";
import { assertLocalRequest } from "@/lib/http";
import { listRecentNotes, parseSaveBody, readNote, writeNote } from "@/lib/notes";
import { readRawFile } from "@/lib/raw-files";
import { buildTree } from "@/lib/tree";
import { ensureWorkspace, resolveInWorkspace, WorkspaceError } from "@/lib/workspace";

let root: string;
let outside: string;

beforeAll(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "notate-test-"));
  root = path.join(base, "workspace");
  outside = path.join(base, "secret.md");
  await fs.mkdir(path.join(root, "papers"), { recursive: true });
  await fs.writeFile(outside, "top secret");
  await fs.writeFile(
    path.join(root, "papers", "deseq2.md"),
    "---\ntitle: DESeq2\ndate: 2026-09-15\ntags: [rna-seq, stats]\n---\n\n# Notes\n",
  );
  await fs.writeFile(path.join(root, "pipeline.py"), "print('hi')\n");
  await fs.writeFile(path.join(root, "paper.pdf"), "%PDF-1.4 fake");
  await fs.writeFile(path.join(root, "image.bin"), Buffer.from([0x89, 0x50, 0x00, 0x47]));
  await fs.writeFile(path.join(root, ".hidden.md"), "hidden");
  process.env.WORKSPACE_DIR = root;
});

afterAll(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true });
});

async function expectStatus(promise: Promise<unknown>, status: number) {
  await expect(promise).rejects.toSatisfy(
    (err) => err instanceof WorkspaceError && err.status === status,
  );
}

describe("resolveInWorkspace", () => {
  it("resolves normal paths", async () => {
    const r = await resolveInWorkspace(["papers", "deseq2.md"]);
    expect(r.relative).toBe("papers/deseq2.md");
    expect(r.absolute).toBe(path.join(root, "papers", "deseq2.md"));
  });

  it.each([
    [[".."], "parent segment"],
    [["papers", "..", "..", "secret.md"], "nested traversal"],
    [["..\\secret.md"], "backslash traversal"],
    [["a/../../secret.md"], "encoded slash"],
    [["C:", "Windows"], "drive letter"],
    [["note.md:stream"], "alternate data stream"],
    [[".hidden.md"], "dotfile"],
    [["CON.md"], "reserved device name"],
    [[""], "empty segment"],
    [[], "empty path"],
  ])("rejects %j (%s)", async (segments) => {
    await expectStatus(resolveInWorkspace(segments), 400);
  });

  it("rejects symlinks that escape the workspace", async (ctx) => {
    const link = path.join(root, "escape");
    try {
      await fs.symlink(path.dirname(outside), link, "junction");
    } catch {
      ctx.skip(); // Creating links can require elevated rights on Windows.
    }
    await expectStatus(resolveInWorkspace(["escape", "secret.md"]), 403);
    await fs.rm(link, { force: true, recursive: false });
  });
});

describe("ensureWorkspace", () => {
  it("seeds a missing workspace once under concurrent first requests", async () => {
    const fresh = path.join(path.dirname(root), "fresh-workspace");
    process.env.WORKSPACE_DIR = fresh;
    try {
      const results = await Promise.all(Array.from({ length: 5 }, () => ensureWorkspace()));
      expect(new Set(results)).toEqual(new Set([fresh]));
      expect((await fs.stat(path.join(fresh, "welcome.md"))).isFile()).toBe(true);
    } finally {
      process.env.WORKSPACE_DIR = root;
    }
  });
});

describe("frontmatter", () => {
  it("keeps dates as strings and round-trips", () => {
    const raw = "---\ntitle: A\ndate: 2026-09-15\ntags: [etl, python]\n---\nBody\n";
    const { frontmatter, content } = parseMarkdown(raw);
    expect(frontmatter).toEqual({ title: "A", date: "2026-09-15", tags: ["etl", "python"] });

    const out = stringifyMarkdown(frontmatter, content);
    expect(out).toContain("date: 2026-09-15\n");
    expect(out).toContain("tags: [etl, python]");
    expect(parseMarkdown(out)).toEqual({ frontmatter, content });
  });

  it("omits the frontmatter block when empty", () => {
    expect(stringifyMarkdown({}, "# Hi\n")).toBe("# Hi\n");
  });
});

describe("buildTree", () => {
  it("lists folders first and hides dotfiles", async () => {
    const tree = await buildTree(root);
    const names = tree.children!.map((c) => c.name);
    expect(names[0]).toBe("papers");
    expect(names).not.toContain(".hidden.md");
    expect(tree.children!.find((c) => c.name === "pipeline.py")).toMatchObject({
      type: "file",
      ext: "py",
      path: "pipeline.py",
    });
  });
});

describe("notes", () => {
  it("reads frontmatter and content", async () => {
    const note = await readNote(["papers", "deseq2.md"]);
    expect(note.frontmatter.title).toBe("DESeq2");
    expect(note.content.trim()).toBe("# Notes");
  });

  it("404s for missing notes and 415s for non-markdown", async () => {
    await expectStatus(readNote(["nope.md"]), 404);
    await expectStatus(readNote(["pipeline.py"]), 415);
  });

  it("writes, creating folders, and refuses createOnly overwrites", async () => {
    const body = { frontmatter: { title: "New" }, content: "hello\n" };
    await writeNote(["drafts", "new.md"], body);
    expect((await readNote(["drafts", "new.md"])).content).toBe("hello\n");
    await expectStatus(writeNote(["drafts", "new.md"], { ...body, createOnly: true }), 409);
  });

  it("validates save bodies", () => {
    expect(() => parseSaveBody({ content: 3 })).toThrow(WorkspaceError);
    expect(() => parseSaveBody({ content: "", frontmatter: [] })).toThrow(WorkspaceError);
    expect(parseSaveBody({ content: "x" })).toEqual({ content: "x" });
  });

  it("lists recent notes with titles", async () => {
    const recent = await listRecentNotes();
    expect(recent.map((n) => n.path)).toContain("papers/deseq2.md");
    expect(recent.find((n) => n.path === "papers/deseq2.md")?.tags).toEqual(["rna-seq", "stats"]);
  });
});

describe("readRawFile", () => {
  it("serves text, PDFs, and rejects binaries", async () => {
    expect((await readRawFile(["pipeline.py"])).contentType).toMatch(/^text\/plain/);
    expect((await readRawFile(["paper.pdf"])).contentType).toBe("application/pdf");
    await expectStatus(readRawFile(["image.bin"]), 415);
    await expectStatus(readRawFile(["papers"]), 404);
  });
});

describe("assertLocalRequest", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/fs/tree", { headers });

  it("allows same-origin localhost requests", () => {
    expect(() => assertLocalRequest(req({ host: "localhost:3000" }))).not.toThrow();
    expect(() =>
      assertLocalRequest(req({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" })),
    ).not.toThrow();
  });

  it("rejects foreign hosts and cross-origin callers", () => {
    expect(() => assertLocalRequest(req({ host: "evil.example:3000" }))).toThrow(WorkspaceError);
    expect(() =>
      assertLocalRequest(req({ host: "localhost:3000", origin: "https://evil.example" })),
    ).toThrow(WorkspaceError);
    expect(() => assertLocalRequest(req({ host: "localhost:3000", origin: "null" }))).toThrow(
      WorkspaceError,
    );
  });
});
