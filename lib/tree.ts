import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import type { TreeNode } from "./types";
import { IGNORED_NAMES } from "./workspace";

function isHidden(name: string): boolean {
  return name.startsWith(".") || IGNORED_NAMES.has(name);
}

/**
 * Recursively scans `dir` into a nested tree. Symlinks are skipped so a link
 * cycle (or a link pointing outside the workspace) can't hang or leak the scan.
 * Folders sort before files, then alphabetically.
 */
export async function buildTree(dir: string, relative = ""): Promise<TreeNode> {
  const stat = await fs.stat(dir);
  const entries = await fs.readdir(dir, { withFileTypes: true });

  const children = await Promise.all(
    entries
      .filter((e) => !isHidden(e.name) && !e.isSymbolicLink())
      .map(async (entry): Promise<TreeNode | null> => {
        const childRel = relative ? `${relative}/${entry.name}` : entry.name;
        const childAbs = path.join(dir, entry.name);
        if (entry.isDirectory()) return buildTree(childAbs, childRel);
        if (!entry.isFile()) return null;
        const s = await fs.stat(childAbs);
        return {
          name: entry.name,
          path: childRel,
          type: "file",
          ext: path.extname(entry.name).slice(1).toLowerCase(),
          mtime: s.mtimeMs,
          size: s.size,
        };
      }),
  );

  return {
    name: relative ? path.basename(dir) : "workspace",
    path: relative,
    type: "dir",
    mtime: stat.mtimeMs,
    children: children
      .filter((c): c is TreeNode => c !== null)
      .sort((a, b) =>
        a.type === b.type
          ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
          : a.type === "dir"
            ? -1
            : 1,
      ),
  };
}

export function flattenFiles(node: TreeNode): TreeNode[] {
  if (node.type === "file") return [node];
  return (node.children ?? []).flatMap(flattenFiles);
}
