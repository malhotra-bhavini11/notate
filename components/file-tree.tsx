"use client";

import { ChevronRight, File, FileCode, FileText, FileType, Folder, FolderOpen } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { TreeNode } from "@/lib/types";

const CODE_EXTS = new Set([
  "py", "r", "ipynb", "js", "ts", "tsx", "sh", "bash", "yaml", "yml", "json", "toml",
  "xml", "sql", "nf", "smk", "wdl", "c", "cpp", "h", "rs", "go", "java", "jl", "m",
]);

export function FileIcon({ ext }: { ext?: string }) {
  const cls = "size-4 shrink-0 text-muted-foreground";
  if (ext === "md") return <FileText className={cls} />;
  if (ext === "pdf") return <FileType className={cn(cls, "text-red-500/80")} />;
  if (ext && CODE_EXTS.has(ext)) return <FileCode className={cn(cls, "text-sky-600/80")} />;
  return <File className={cls} />;
}

/** Keeps files whose path matches the query, plus the folders leading to them. */
function filterTree(node: TreeNode, query: string): TreeNode | null {
  if (node.type === "file") return node.path.toLowerCase().includes(query) ? node : null;
  const children = (node.children ?? [])
    .map((c) => filterTree(c, query))
    .filter((c): c is TreeNode => c !== null);
  return children.length > 0 || (node.path && node.name.toLowerCase().includes(query))
    ? { ...node, children }
    : null;
}

function ancestorsOf(paths: string[]): Set<string> {
  const set = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join("/"));
  }
  return set;
}

interface FileTreeProps {
  root: TreeNode;
  /** Highlighted files: the open note/file, or both panes in split view. */
  activePaths: string[];
  hrefFor: (path: string) => string;
  /** Called when a file link is followed, e.g. to close the mobile sidebar. */
  onNavigate?: () => void;
  query: string;
}

export function FileTree({ root, activePaths, hrefFor, onNavigate, query }: FileTreeProps) {
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => (q ? filterTree(root, q) : root), [root, q]);
  const activeAncestors = ancestorsOf(activePaths);

  // Folders start collapsed except those containing an open file; while
  // filtering, everything that matched is shown expanded.
  const isOpen = (p: string) => (q ? true : (toggled.get(p) ?? activeAncestors.has(p)));
  const toggle = (p: string) => setToggled((prev) => new Map(prev).set(p, !isOpen(p)));

  if (!visible || !visible.children?.length) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        {q ? "No matching files." : "Workspace is empty."}
      </p>
    );
  }

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const indent = { paddingLeft: `${depth * 12 + 8}px` };

    if (node.type === "dir") {
      const open = isOpen(node.path);
      return (
        <li key={node.path}>
          <button
            type="button"
            onClick={() => toggle(node.path)}
            aria-expanded={open}
            className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm hover:bg-sidebar-accent"
            style={indent}
          >
            <ChevronRight
              className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            />
            {open ? (
              <FolderOpen className="size-4 shrink-0 text-amber-600/80" />
            ) : (
              <Folder className="size-4 shrink-0 text-amber-600/80" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {open && node.children && node.children.length > 0 && (
            <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>
          )}
        </li>
      );
    }

    const active = activePaths.includes(node.path);
    return (
      <li key={node.path}>
        <Link
          href={hrefFor(node.path)}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          title={node.path}
          className={cn(
            "flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm hover:bg-sidebar-accent",
            active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
          )}
          // Files have no chevron; pad so icons line up with folder icons.
          style={{ paddingLeft: `${depth * 12 + 8 + 20}px` }}
        >
          <FileIcon ext={node.ext} />
          <span className="truncate">{node.name}</span>
        </Link>
      </li>
    );
  };

  return <ul className="space-y-px">{visible.children.map((c) => renderNode(c, 0))}</ul>;
}
