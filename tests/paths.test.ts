import { describe, expect, it } from "vitest";

import { anchorFromParams, fileLink, formatAnchor, parseAnchor } from "@/lib/anchors";
import { activePaths, anchoredFileHref, fileHref, parseLocation, splitHref, splitToggleHref, treeHrefFor } from "@/lib/paths";

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

describe("anchored file links", () => {
  it("parses and formats line and page anchors", () => {
    expect(parseAnchor("L19")).toEqual({ kind: "lines", start: 19, end: 19 });
    expect(parseAnchor("L22-L19")).toEqual({ kind: "lines", start: 19, end: 22 });
    expect(parseAnchor("#L19-22")).toEqual({ kind: "lines", start: 19, end: 22 });
    expect(parseAnchor("page=3")).toEqual({ kind: "page", page: 3 });
    expect(parseAnchor("p3")).toEqual({ kind: "page", page: 3 });
    expect(parseAnchor("Methods")).toBeNull();
    expect(parseAnchor("L0")).toBeNull();
    expect(formatAnchor({ kind: "lines", start: 19, end: 22 })).toBe("L19-L22");
    expect(fileLink("pipelines/qc.py", { kind: "lines", start: 5, end: 5 })).toBe("[[pipelines/qc.py#L5]]");
  });

  it("round-trips anchors through URLs", () => {
    const anchor = { kind: "lines", start: 19, end: 22 } as const;
    const href = splitHref({ file: "pipelines/qc.py", note: "n.md", anchor });
    expect(href).toBe("/split?file=pipelines/qc.py&note=n.md&lines=19-22");
    expect(anchorFromParams(new URL(href, "http://x").searchParams)).toEqual(anchor);
    expect(fileHref("paper.pdf", { kind: "page", page: 3 })).toBe("/files/paper.pdf?page=3");
    expect(anchorFromParams(new URLSearchParams("lines=7"))).toEqual({ kind: "lines", start: 7, end: 7 });
    expect(anchorFromParams(new URLSearchParams("lines=abc"))).toBeNull();
  });

  it("opens anchored files beside the current note", () => {
    const anchor = { kind: "page", page: 2 } as const;
    expect(anchoredFileHref(loc("/notes/n.md"), "p.pdf", anchor)).toBe("/split?file=p.pdf&note=n.md&page=2");
    expect(anchoredFileHref(loc("/split?file=a.py&note=n.md"), "p.pdf", anchor)).toBe("/split?file=p.pdf&note=n.md&page=2");
    expect(anchoredFileHref(loc("/"), "p.pdf", anchor)).toBe("/files/p.pdf?page=2");
  });
});
