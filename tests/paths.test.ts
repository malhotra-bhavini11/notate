import { describe, expect, it } from "vitest";

import { activePaths, parseLocation, splitHref, splitToggleHref, treeHrefFor } from "@/lib/paths";

const loc = (url: string) => {
  const u = new URL(url, "http://localhost");
  return parseLocation(u.pathname, u.searchParams);
};

describe("splitHref", () => {
  it("keeps slashes readable and escapes the rest", () => {
    expect(splitHref({ file: "papers/a b&c.pdf", note: "papers/n.md" })).toBe(
      "/split?file=papers/a%20b%26c.pdf&note=papers/n.md",
    );
    expect(splitHref({ note: "x.md" })).toBe("/split?note=x.md");
    expect(splitHref({})).toBe("/split");
  });

  it("round-trips through parseLocation", () => {
    const href = splitHref({ file: "data/100% raw.csv", note: "notes/q&a.md" });
    expect(loc(href)).toEqual({ mode: "split", file: "data/100% raw.csv", note: "notes/q&a.md" });
  });
});

describe("parseLocation", () => {
  it("recognises each route", () => {
    expect(loc("/")).toEqual({ mode: "dashboard" });
    expect(loc("/notes/papers/my%20note.md")).toEqual({ mode: "note", note: "papers/my note.md" });
    expect(loc("/files/pipelines/run.py")).toEqual({ mode: "file", file: "pipelines/run.py" });
    expect(loc("/split?file=a.pdf")).toEqual({ mode: "split", file: "a.pdf", note: null });
    expect(loc("/tags")).toEqual({ mode: "tags", tag: null });
    expect(loc("/tags/bio/rna-seq")).toEqual({ mode: "tags", tag: "bio/rna-seq" });
  });
});

describe("tree links and toggle", () => {
  const split = loc("/split?file=a.pdf&note=n.md");

  it("routes tree clicks into the matching pane while split", () => {
    expect(treeHrefFor(split, "other.md")).toBe("/split?file=a.pdf&note=other.md");
    expect(treeHrefFor(split, "code/run.py")).toBe("/split?file=code/run.py&note=n.md");
    expect(treeHrefFor(loc("/"), "code/run.py")).toBe("/files/code/run.py");
  });

  it("toggles in and out of split view", () => {
    expect(splitToggleHref(loc("/notes/n.md"))).toBe("/split?note=n.md");
    expect(splitToggleHref(loc("/files/a.pdf"))).toBe("/split?file=a.pdf");
    expect(splitToggleHref(split)).toBe("/notes/n.md");
    expect(splitToggleHref(loc("/split?file=a.pdf"))).toBe("/files/a.pdf");
    expect(activePaths(split)).toEqual(["a.pdf", "n.md"]);
  });
});
