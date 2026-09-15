"use client";

import { Columns2, NotebookPen, PanelLeft, Plus, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { FileTree } from "@/components/file-tree";
import { NewNoteDialog } from "@/components/new-note-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspace } from "@/components/workspace-provider";
import { joinSlug } from "@/lib/paths";
import { cn } from "@/lib/utils";

/** `/notes/papers/a.md` -> `papers/a.md`; null on routes that aren't a file. */
function activePathFrom(pathname: string): string | null {
  const match = pathname.match(/^\/(?:notes|files)\/(.+)$/);
  return match ? joinSlug(match[1].split("/")) : null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tree, error, loading, refresh, newNoteOpen, setNewNoteOpen } = useWorkspace();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const activePath = activePathFrom(pathname);

  // Ctrl/Cmd+K focuses search, Ctrl/Cmd+Alt+N opens the new-note dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSidebarOpen(true);
        requestAnimationFrame(() => document.getElementById("workspace-search")?.focus());
      } else if (mod && e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewNoteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setNewNoteOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside
        className={cn(
          "flex w-72 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[margin] duration-200",
          !sidebarOpen && "-ml-72",
        )}
        aria-label="Workspace"
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
      >
        <div className="flex h-12 items-center justify-between gap-2 border-b px-3">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <NotebookPen className="size-4" />
            notate
          </Link>
          <div className="flex items-center">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="ghost" size="icon-sm" onClick={() => void refresh()} aria-label="Refresh file tree" />
                }
              >
                <RefreshCw className={cn(loading && "animate-spin")} />
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="ghost" size="icon-sm" onClick={() => setNewNoteOpen(true)} aria-label="New note" />
                }
              >
                <Plus />
              </TooltipTrigger>
              <TooltipContent>New note (Ctrl+Alt+N)</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="workspace-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Filter files…  Ctrl+K"
              className="h-8 bg-background pl-8"
            />
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {error ? (
            <p className="px-3 py-2 text-xs text-destructive">Couldn&apos;t load workspace: {error}</p>
          ) : tree ? (
            <FileTree root={tree} activePath={activePath} query={query} />
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            aria-pressed={sidebarOpen}
          >
            <PanelLeft />
          </Button>
          <Breadcrumbs path={activePath} />
          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              {/* Wrapped in a span so the tooltip still works while the button is disabled. */}
              <TooltipTrigger render={<span tabIndex={0} />}>
                <Button variant="outline" size="sm" disabled>
                  <Columns2 />
                  Split view
                </Button>
              </TooltipTrigger>
              <TooltipContent>Coming with the dual-pane viewer (Feature 2)</TooltipContent>
            </Tooltip>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <NewNoteDialog open={newNoteOpen} onOpenChange={setNewNoteOpen} />
    </div>
  );
}

function Breadcrumbs({ path }: { path: string | null }) {
  if (!path) return <span className="text-sm text-muted-foreground">Dashboard</span>;
  const parts = path.split("/");
  return (
    <ol className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
      {parts.map((part, i) => (
        <li key={i} className={cn("flex min-w-0 items-center gap-1", i === parts.length - 1 && "text-foreground")}>
          {i > 0 && <span aria-hidden>/</span>}
          <span className="truncate">{part}</span>
        </li>
      ))}
    </ol>
  );
}
