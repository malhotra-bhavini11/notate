import type { Element, Root as HastRoot } from "hast";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rehypeFigures } from "@/lib/figures";
import { assetFileName, imageMarkdown, isImagePath, sniffImage } from "@/lib/images";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
const SVG = new Uint8Array(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'));

describe("image files", () => {
  it("recognises image paths by extension", () => {
    expect(["plot.png", "a/b/Chart.JPEG", "fig.svg"].every(isImagePath)).toBe(true);
    expect(["notes.md", "paper.pdf", "script.py", "noextension"].some(isImagePath)).toBe(false);
  });

  it("identifies images by their bytes, not their name", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(JPG)).toBe("jpg");
    expect(sniffImage(WEBP)).toBe("webp");
    expect(sniffImage(SVG)).toBe("svg");
    expect(sniffImage(new Uint8Array(Buffer.from("MZ\0 not an image")))).toBeNull();
  });

  it("names a file after the note, keeping a real name and stamping a pasted one", () => {
    const now = new Date(2026, 8, 16, 14, 30, 12);
    expect(assetFileName({ ext: "png", notePath: "papers/deseq2-love-2014.md", originalName: "Dispersion Plot.png" })).toBe(
      "deseq2-love-2014-dispersion-plot.png",
    );
    expect(assetFileName({ ext: "png", notePath: "papers/x.md", originalName: "image.png", now })).toBe(
      "x-20260916-143012.png",
    );
    expect(assetFileName({ ext: "webp", now })).toBe("20260916-143012.webp");
  });

  it("writes markdown, quoting paths with spaces and captions", () => {
    expect(imageMarkdown("assets/plot.png", "PCA")).toBe("![PCA](assets/plot.png)");
    expect(imageMarkdown("assets/my plot.png")).toBe("![](<assets/my plot.png>)");
    expect(imageMarkdown("a.png", "alt", 'the "big" one')).toBe("![alt](a.png \"the 'big' one\")");
  });
});

describe("rehypeFigures", () => {
  const render = async (markdown: string) => {
    const processor = unified().use(remarkParse).use(remarkRehype).use(rehypeFigures);
    const tree = (await processor.run(processor.parse(markdown))) as HastRoot;
    return tree.children.filter((c): c is Element => c.type === "element");
  };

  it("turns an image on its own line into a numbered figure with a caption", async () => {
    const [first, second] = await render('![PCA of samples](assets/pca.png)\n\n![](assets/qc.png "Read quality")');
    expect(first.tagName).toBe("figure");
    expect(first.properties.dataFigure).toBe("1");
    const caption = first.children.find((c): c is Element => c.type === "element" && c.tagName === "figcaption")!;
    expect(caption.children).toEqual([{ type: "text", value: "PCA of samples" }]);
    // The title wins over alt as the caption, and numbering continues.
    const secondCaption = second.children.find((c): c is Element => c.type === "element" && c.tagName === "figcaption")!;
    expect([second.properties.dataFigure, secondCaption.children]).toEqual(["2", [{ type: "text", value: "Read quality" }]]);
  });

  it("leaves an image with text beside it inline", async () => {
    const [paragraph] = await render("See ![icon](i.png) here.");
    expect(paragraph.tagName).toBe("p");
  });
});

describe("saving an upload", () => {
  let root: string;
  let uploads: typeof import("@/lib/uploads");

  beforeAll(async () => {
    root = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "notate-images-")), "workspace");
    process.env.WORKSPACE_DIR = root;
    await fs.mkdir(root, { recursive: true });
    uploads = await import("@/lib/uploads");
  });

  afterAll(async () => {
    await fs.rm(path.dirname(root), { recursive: true, force: true });
  });

  it("writes the image into assets/ and never overwrites one", async () => {
    const first = await uploads.saveImage({ bytes: PNG, originalName: "plot.png", notePath: "papers/deseq2.md" });
    expect(first).toEqual({ path: "assets/deseq2-plot.png", bytes: PNG.byteLength });
    expect(await fs.readFile(path.join(root, "assets", "deseq2-plot.png"))).toEqual(Buffer.from(PNG));

    const second = await uploads.saveImage({ bytes: PNG, originalName: "plot.png", notePath: "papers/deseq2.md" });
    expect(second.path).toBe("assets/deseq2-plot-2.png");
  });

  it("refuses anything that isn't really an image, and empty files", async () => {
    const notAnImage = new Uint8Array(Buffer.from("#!/bin/sh\nrm -rf /\n"));
    await expect(uploads.saveImage({ bytes: notAnImage, originalName: "evil.png" })).rejects.toThrow(/isn't an image/);
    await expect(uploads.saveImage({ bytes: new Uint8Array(), originalName: "a.png" })).rejects.toThrow(/Empty/);
  });

  it("trusts the bytes over the extension", async () => {
    const saved = await uploads.saveImage({ bytes: JPG, originalName: "screenshot.png", notePath: "n.md" });
    expect(saved.path).toBe("assets/n-screenshot.jpg");
  });

  it("keeps uploads inside the workspace", async () => {
    await expect(
      uploads.saveImage({ bytes: PNG, originalName: "x.png", folder: "../../outside" }),
    ).rejects.toThrow();
  });
});
