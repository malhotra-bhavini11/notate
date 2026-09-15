import type { Element, Root as HastRoot } from "hast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";

import { remarkWikiTokens } from "@/lib/markdown-tokens";

// Runs the same plugin chain as the preview up to hast, where react-markdown's
// `a` renderer reads `node.properties`.
async function anchors(markdown: string) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkWikiTokens).use(remarkRehype);
  const tree = (await processor.run(processor.parse(markdown))) as HastRoot;
  const found: Element["properties"][] = [];
  visit(tree, "element", (node: Element) => {
    if (node.tagName === "a") found.push(node.properties);
  });
  return found;
}

describe("remarkWikiTokens", () => {
  it("exposes wikilink and tag data as hast properties the renderer reads", async () => {
    const props = await anchors("See [[deseq2#Methods|DESeq2]] and #rna-seq, not `[[code]]`.");
    expect(props).toEqual([
      expect.objectContaining({ dataWikilink: "deseq2", dataHeading: "Methods", dataAlias: "DESeq2" }),
      expect.objectContaining({ dataTag: "rna-seq" }),
    ]);
  });

  it("turns accessions into external links", async () => {
    const props = await anchors("Data: GSE60450, structure PDB 1TUP.");
    expect(props).toEqual([
      expect.objectContaining({ href: "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE60450", dataAccession: "geo" }),
      expect.objectContaining({ href: "https://www.rcsb.org/structure/1TUP", dataAccession: "pdb", dataAccessionId: "1TUP" }),
    ]);
  });
});
