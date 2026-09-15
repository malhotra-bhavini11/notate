// Client-safe tree helpers (lib/tree.ts is server-only because it touches fs).

import type { TreeNode } from "./types";

export function flattenTree(node: TreeNode | null): TreeNode[] {
  if (!node) return [];
  if (node.type === "file") return [node];
  return (node.children ?? []).flatMap(flattenTree);
}
