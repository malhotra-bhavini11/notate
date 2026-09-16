// An image on a line of its own becomes a numbered figure, the way it would in
// a paper. Inline images (an icon mid-sentence) are left alone.

import type { Element as HastElement, Root as HastRoot } from "hast";

const isWhitespace = (node: HastElement["children"][number]) => node.type === "text" && node.value.trim() === "";

/** The single image in a paragraph that holds nothing else, or null. */
function loneImage(node: HastElement): HastElement | null {
  if (node.tagName !== "p") return null;
  const children = node.children.filter((child) => !isWhitespace(child));
  const [only] = children;
  return children.length === 1 && only.type === "element" && only.tagName === "img" ? only : null;
}

/**
 * Rehype plugin: replaces such a paragraph with `<figure>`, numbering them in
 * document order and taking the caption from the image's title, then its alt.
 */
export function rehypeFigures() {
  return (tree: HastRoot) => {
    let number = 0;
    const walk = (node: HastRoot | HastElement) => {
      node.children.forEach((child, i) => {
        if (child.type !== "element") return;
        const image = loneImage(child);
        if (!image) {
          walk(child);
          return;
        }
        number += 1;
        const title = typeof image.properties.title === "string" ? image.properties.title : "";
        const alt = typeof image.properties.alt === "string" ? image.properties.alt : "";
        const caption = title || alt;
        image.properties.dataFigure = String(number);
        node.children[i] = {
          type: "element",
          tagName: "figure",
          properties: { dataFigure: String(number) },
          children: [
            image,
            {
              type: "element",
              tagName: "figcaption",
              properties: { dataFigure: String(number) },
              children: caption ? [{ type: "text", value: caption }] : [],
            },
          ],
        };
      });
    };
    walk(tree);
  };
}
