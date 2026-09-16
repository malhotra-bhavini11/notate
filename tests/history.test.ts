import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { diffLines } from "@/lib/diff";

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("diffLines", () => {
  it("reports added and removed lines with both line numbers", () => {
    const diff = diffLines("one\ntwo\nthree\n", "one\ntwo point five\nthree\n");
    expect(diff).toMatchObject({ added: 1, removed: 1, truncated: false });
    expect(diff.rows.map((r) => [r.kind, r.text])).toEqual([
      ["context", "one"],
      ["remove", "two"],
      ["add", "two point five"],
      ["context", "three"],
    ]);
    expect(diff.rows[2]).toMatchObject({ newLine: 2 });
  });

  it("collapses long unchanged runs and reports no rows for identical text", () => {
    const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    const diff = diffLines(before, `${before}\nnew last line`);
    expect(diff.rows[0]).toEqual({ kind: "gap", text: "", count: 27 });
    expect(diff.rows.at(-1)).toMatchObject({ kind: "add", text: "new last line" });
    expect(diffLines(before, before).rows).toEqual([]);
  });
});

describe.skipIf(!hasGit)("workspace history", () => {
  let root: string;
  let history: typeof import("@/lib/history");
  const note = (name: string) => [name];

  beforeAll(async () => {
    root = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "notate-history-")), "workspace");
    process.env.WORKSPACE_DIR = root;
    process.env.NOTATE_HISTORY = "off"; // no background snapshots during the test
    history = await import("@/lib/history");
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, "note.md"), "# First\n");
  });

  afterAll(async () => {
    await fs.rm(path.dirname(root), { recursive: true, force: true });
  });

  it("reports an untracked workspace before anything is set up", async () => {
    const status = await history.getStatus();
    expect(status).toMatchObject({ git: true, tracked: false, commits: 0 });
    await expect(history.snapshot()).rejects.toThrow(/isn't turned on/);
  });

  it("initialises a repository of its own and commits what is there", async () => {
    const status = await history.initHistory();
    expect(status).toMatchObject({ tracked: true, commits: 1, pending: 0 });
    expect(status.last?.subject).toBe("Start tracking notes");
    // The workspace gets its own repo rather than joining one further up.
    expect(await fs.stat(path.join(root, ".git"))).toBeTruthy();
  });

  it("snapshots later edits and names them after what changed", async () => {
    await fs.writeFile(path.join(root, "note.md"), "# First\n\nSecond line.\n");
    expect((await history.getStatus()).pending).toBe(1);

    const commit = await history.snapshot();
    expect(commit?.subject).toBe("Update note.md");
    expect(commit?.files).toEqual(["note.md"]);
    expect(await history.snapshot()).toBeNull(); // nothing left to commit

    await fs.writeFile(path.join(root, "other.md"), "hello\n");
    await fs.writeFile(path.join(root, "note.md"), "# First\n\nSecond line changed.\n");
    expect((await history.snapshot())?.subject).toBe("2 files: note.md, other.md");
  });

  it("lists a single note's snapshots and reads it as it was", async () => {
    const commits = await history.listCommits("note.md");
    expect(commits.map((c) => c.subject)).toEqual([
      "2 files: note.md, other.md",
      "Update note.md",
      "Start tracking notes",
    ]);
    const first = await history.readAtRevision(note("note.md"), commits.at(-1)!.hash);
    expect(first.content).toBe("# First\n");
    await expect(history.readAtRevision(note("note.md"), "nonsense")).rejects.toThrow(/Not a snapshot id/);
    await expect(history.readAtRevision(note("missing.md"), commits[0].hash)).rejects.toThrow(/isn't in snapshot/);
  });

  it("restores an old version as a new snapshot, leaving history intact", async () => {
    const commits = await history.listCommits("note.md");
    const oldest = commits.at(-1)!;
    const restored = await history.restore(note("note.md"), oldest.hash);

    expect(restored.content).toBe("# First\n");
    expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe("# First\n");
    const after = await history.listCommits("note.md");
    expect(after[0].subject).toBe(`Restore note.md to ${oldest.hash.slice(0, 7)}`);
    expect(after).toHaveLength(commits.length + 1); // nothing was rewritten
  });
});
