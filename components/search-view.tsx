"use client";

import { FileText, ListFilter, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { fileHref, noteHref, queryHref, searchApiUrl, searchHref } from "@/lib/paths";
import type { SearchHit, SearchResult } from "@/lib/search";
import { cn } from "@/lib/utils";

interface State {
  results: SearchResult[];
  error: string | null;
  loading: boolean;
}

/** Where a hit opens: a note at that line in the editor, a file at that line in the viewer. */
function hitHref(result: SearchResult, hit?: SearchHit): string {
  if (result.kind === "note") {
    // A hit in the frontmatter has no body line, so the note just opens at the top.
    return hit && hit.bodyLine > 0 ? `${noteHref(result.path)}?line=${hit.bodyLine}` : noteHref(result.path);
  }
  return hit ? fileHref(result.path, { kind: "lines", start: hit.line, end: hit.line }) : fileHref(result.path);
}

export function SearchView({ initialQuery }: { initialQuery: string }) {
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [state, setState] = useState<State>({ results: [], error: null, loading: false });
  const inputRef = useRef<HTMLInputElement>(null);

  // Search once typing pauses, and record it in the URL without navigating.
  useEffect(() => {
    if (draft === query) return;
    const timer = setTimeout(() => {
      setQuery(draft);
      window.history.replaceState(null, "", searchHref(draft));
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, query]);

  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    fetch(searchApiUrl(query), { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        setState({ results: json.results, error: null, loading: false });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({ results: [], error: err instanceof Error ? err.message : String(err), loading: false });
      });
    return () => controller.abort();
  }, [query]);

  // An empty box shows nothing rather than the last query's results.
  const results = query.trim() ? state.results : [];
  const total = results.reduce((n, r) => n + r.matches, 0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Every word in your notes and in the code, configs and data beside them.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setDraft("")}
          placeholder={`dispersion  "raw counts"  -deprecated`}
          aria-label="Search notes and files"
          spellCheck={false}
          autoFocus
          className="h-10 pl-9"
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Words match anywhere and combine with AND. Quote a phrase, put <code>-</code> in front of a word to exclude it.
        To filter by frontmatter instead, use <Link href={queryHref(query)} className="underline">Query</Link>.
      </p>

      {state.error && <p className="mt-6 text-sm text-destructive">Search failed: {state.error}</p>}

      {query.trim() && !state.error && (
        <p className="mt-6 mb-3 text-sm text-muted-foreground tabular-nums">
          {results.length === 0
            ? "No matches."
            : `${total} match${total === 1 ? "" : "es"} in ${results.length} file${results.length === 1 ? "" : "s"}`}
        </p>
      )}

      <ol className="space-y-3">
        {results.map((result) => (
          <li key={result.path} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <Link href={hitHref(result)} className="font-medium hover:underline">
                {result.title}
              </Link>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileText className="size-3" />
                {result.path}
              </span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {result.matches} match{result.matches === 1 ? "" : "es"}
              </span>
            </div>
            {result.hits.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Matched the title or path.</p>
            )}
            <ul className="mt-2 space-y-1">
              {result.hits.map((hit) => (
                <li key={hit.line}>
                  <Link
                    href={hitHref(result, hit)}
                    className="flex gap-3 rounded-md px-2 py-1 font-mono text-xs leading-5 hover:bg-muted"
                  >
                    <span className="w-8 shrink-0 text-right text-muted-foreground tabular-nums">{hit.line}</span>
                    <span className="min-w-0 break-words whitespace-pre-wrap">
                      {hit.trimmedStart && "… "}
                      <Highlighted text={hit.text} ranges={hit.ranges} />
                      {hit.trimmedEnd && " …"}
                    </span>
                  </Link>
                </li>
              ))}
              {result.matches > result.hits.length && (
                <li className="px-2 text-xs text-muted-foreground">
                  and {result.matches - result.hits.length} more in this file
                </li>
              )}
            </ul>
          </li>
        ))}
      </ol>

      {!query.trim() && (
        <div className="mt-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <ListFilter className="mx-auto mb-2 size-5" />
          Type to search. Results show the matching lines; click one to open the note there.
        </div>
      )}
    </div>
  );
}

function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={i} className={cn("rounded-sm bg-amber-300/60 text-inherit dark:bg-amber-400/30")}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
