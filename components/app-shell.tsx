"use client";

import { BookPlus, Columns2, FileText, Hash, Library, NotebookPen, PanelLeft, Plus, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";

import { FileIcon, FileTree } from "@/components/file-tree";
import { ImportCitationDialog } from "@/components/import-citation-dialog";
import { NewNoteDialog } from "@/components/new-note-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceLocation } from "@/components/use-workspace-location";
import { useWorkspace } from "@/components/workspace-provider";
import { activePaths, referencesHref, splitToggleHref, tagHref, treeHrefFor, type WorkspaceLocation } from "@/lib/paths";
import { cn } from "@/lib/utils";

const NARROW_QUERY = "(max-width: 767px)";

function subscribeNarrow(onChange: () => void) {
  const mql = window.matchMedia(NARROW_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { error, loading, refresh, openNewNote, openCitationImport, references, index } = useWorkspace();
  const isNarrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW_QUERY).matches, () => false);
  // null = default: docked open on desktop, closed overlay on phones.
  const [sidebarChoice, setSidebarOpen] = useState<boolean | null>(null);
  const sidebarOpen = sidebarChoice ?? !isNarrow;
  const [query, setQuery] = useState("");
  const closeIfNarrow = () => isNarrow && setSidebarOpen(false);

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
        openNewNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNewNote]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {isNarrow && sidebarOpen && (
        <div aria-hidden className="fixed inset-0 z-30 bg-black/20" onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        className={cn(
          "flex w-72 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[margin] duration-200",
          // Phones: the sidebar floats over the content instead of squeezing it.
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-xl",
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
                render={<Button variant="ghost" size="icon-sm" onClick={() => openNewNote()} aria-label="New note" />}
              >
                <Plus />
              </TooltipTrigger>
              <TooltipContent>New note (Ctrl+Alt+N)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="ghost" size="icon-sm" onClick={() => openCitationImport()} aria-label="Import citation" />
                }
              >
                <BookPlus />
              </TooltipTrigger>
              <TooltipContent>Import citation (DOI, PMID, arXiv)</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex gap-1 border-b px-2 py-1.5">
          <Link
            href={referencesHref()}
            onClick={closeIfNarrow}
            className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-sidebar-accent"
          >
            <Library className="size-4 text-muted-foreground" />
            References
            {references && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{references.entries.length}</span>}
          </Link>
          <Link
            href={tagHref()}
            onClick={closeIfNarrow}
            className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-sidebar-accent"
          >
            <Hash className="size-4 text-muted-foreground" />
            Tags
            {index && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{index.tags.length}</span>}
          </Link>
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
          ) : (
            <Suspense fallback={<TreeLoading />}>
              <SidebarTree query={query} onNavigate={closeIfNarrow} />
            </Suspense>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            aria-pressed={sidebarOpen}
          >
            <PanelLeft />
          </Button>
          <Suspense fallback={<div className="flex-1" />}>
            <HeaderLocation />
          </Suspense>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <NewNoteDialog />
      <ImportCitationDialog />
    </div>
  );
}

function TreeLoading() {
  return <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>;
}

function SidebarTree({ query, onNavigate }: { query: string; onNavigate: () => void }) {
  const { tree } = useWorkspace();
  const location = useWorkspaceLocation();
  if (!tree) return <TreeLoading />;
  return (
    <FileTree
      root={tree}
      activePaths={activePaths(location)}
      hrefFor={(p) => treeHrefFor(location, p)}
      onNavigate={onNavigate}
      query={query}
    />
  );
}

function HeaderLocation() {
  const location = useWorkspaceLocation();
  const router = useRouter();
  const toggleHref = splitToggleHref(location);
  const inSplit = location.mode === "split";

  // Ctrl/Cmd+\ toggles split view, mirroring the header button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        e.preventDefault();
        router.push(toggleHref);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, toggleHref]);

  return (
    <>
      <LocationCrumbs location={location} />
      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={inSplit ? "secondary" : "outline"}
                size="sm"
                render={<Link href={toggleHref} />}
                nativeButton={false}
                aria-pressed={inSplit}
              />
            }
          >
            {inSplit ? <X /> : <Columns2 />}
            {inSplit ? "Close split" : "Split view"}
          </TooltipTrigger>
          <TooltipContent>
            {inSplit ? "Back to single view" : "Read a file and write a note side by side"} (Ctrl+\)
          </TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}

function LocationCrumbs({ location }: { location: WorkspaceLocation }) {
  switch (location.mode) {
    case "dashboard":
      return <span className="text-sm text-muted-foreground">Dashboard</span>;
    case "references":
      return <span className="text-sm text-muted-foreground">References</span>;
    case "tags":
      return (
        <span className="truncate text-sm text-muted-foreground">
          Tags{location.tag && <span className="text-foreground"> / #{location.tag}</span>}
        </span>
      );
    case "note":
      return <PathCrumbs path={location.note} />;
    case "file":
      return <PathCrumbs path={location.file} />;
    case "split":
      return (
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <span className="shrink-0 text-muted-foreground">Split view</span>
          {location.file && (
            <span className="flex min-w-0 items-center gap-1.5" title={location.file}>
              <FileIcon ext={location.file.split(".").pop()?.toLowerCase()} />
              <span className="truncate">{location.file.split("/").pop()}</span>
            </span>
          )}
          {location.note && (
            <span className="flex min-w-0 items-center gap-1.5" title={location.note}>
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{location.note.split("/").pop()}</span>
            </span>
          )}
        </div>
      );
  }
}

function PathCrumbs({ path }: { path: string }) {
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
