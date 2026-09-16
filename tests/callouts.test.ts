import type { Element, Root as HastRoot } from "hast";
import type { Root as MdastRoot } from "mdast";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { parseCalloutMarker, remarkCallouts } from "@/lib/callouts";
import { rehypeFenceBlocks } from "@/lib/fence-blocks";

/** Runs the preview's plugin chain far enough to see what the renderers receive. */
async function toHast(markdown: string): Promise<HastRoot> {
  const processor = unified().use(remarkParse).use(remarkCallouts).use(remarkRehype).use(rehypeFenceBlocks);
  return (await processor.run(processor.parse(markdown) as MdastRoot)) as HastRoot;
}

const elements = (root: HastRoot) => root.children.filter((c): c is Element => c.type === "element");
const text = (node: Element): string =>
  node.children.map((c) => (c.type === "text" ? c.value : c.type === "element" ? text(c) : "")).join("");

describe("parseCalloutMarker", () => {
  it("reads the type, title and fold marker", () => {
    expect(parseCalloutMarker("[!theorem] Pythagoras\nrest")).toEqual({ type: "theorem", title: "Pythagoras", fold: null, length: 22 });
    expect(parseCalloutMarker("[!note]-\nhidden")).toMatchObject({ type: "note", title: "", fold: "-" });
    expect(parseCalloutMarker("[!TIP]+ Faster")).toMatchObject({ type: "tip", title: "Faster", fold: "+" });
  });

  it("maps aliases and ignores anything else", () => {
    expect(parseCalloutMarker("[!info] x")).toMatchObject({ type: "note" });
    expect(parseCalloutMarker("[!claim] x")).toMatchObject({ type: "proposition" });
    expect(parseCalloutMarker("[!nonsense] x")).toBeNull();
    expect(parseCalloutMarker("Just a quote")).toBeNull();
  });
});

describe("remarkCallouts", () => {
  it("tags the blockquote, strips the marker and keeps the body", async () => {
    const [callout] = elements(await toHast("> [!warning] Raw counts only\n> DESeq2 needs unnormalised counts."));
    expect(callout.tagName).toBe("aside");
    expect(callout.properties).toEqual({ dataCallout: "warning", dataCalloutTitle: "Raw counts only" });
    expect(text(callout).trim()).toBe("DESeq2 needs unnormalised counts.");
  });

  it("numbers each theorem-like type separately, in document order", async () => {
    const tree = await toHast(
      ["> [!theorem] A", "", "> [!lemma] B", "", "> [!theorem] C", "", "> [!proof]", "> done", "", "> [!note] plain"].join("\n"),
    );
    expect(elements(tree).map((e) => [e.properties.dataCallout, e.properties.dataCalloutNumber])).toEqual([
      ["theorem", "1"],
      ["lemma", "1"],
      ["theorem", "2"],
      ["proof", undefined],
      ["note", undefined],
    ]);
  });

  it("leaves ordinary blockquotes alone and handles a marker on its own line", async () => {
    const [quote] = elements(await toHast("> Just a quotation."));
    expect(quote.tagName).toBe("blockquote");
    const [callout] = elements(await toHast("> [!definition]\n> A *p*-value is …"));
    expect(callout.properties).toEqual({ dataCallout: "definition", dataCalloutNumber: "1" });
    expect(text(callout).trim()).toBe("A p-value is …");
  });

  it("finds callouts nested in lists", async () => {
    const list = elements(await toHast("- step one\n\n  > [!tip] Vectorise it\n"))[0];
    expect(JSON.stringify(list)).toContain('"dataCallout":"tip"');
  });
});

describe("rehypeFenceBlocks", () => {
  it("hands mermaid and query fences to the preview, leaving code fences alone", async () => {
    const tree = await toHast('```mermaid title="Pipeline"\nflowchart LR\n  A --> B\n```\n\n```query\ntype:paper-review\n```\n\n```python\nx = 1\n```');
    expect(elements(tree).map((e) => e.properties)).toEqual([
      { dataMermaid: "flowchart LR\n  A --> B", dataMermaidTitle: "Pipeline" },
      { dataQuery: "type:paper-review" },
      {},
    ]);
    expect(elements(tree).map((e) => e.tagName)).toEqual(["div", "div", "pre"]);
  });
});
