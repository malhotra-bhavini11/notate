"use client";

import { ListFilter } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CopyButton } from "@/components/code-block";
import { LIGHT_COPY, QueryTable, useQueryResult } from "@/components/query-results";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/components/workspace-provider";
import { queryHref } from "@/lib/paths";
import { parseQuery, resultToCsv, VIRTUAL_FIELDS, withSort } from "@/lib/query";
import { cn } from "@/lib/utils";

const EXAMPLES: { label: string; query: string }[] = [
  { label: "Paper reviews without a dataset", query: "type:paper-review -has:dataset" },
  { label: "Tagged RNA-seq, newest first", query: "tag:rna-seq sort:-modified" },
  { label: "Papers from 2010–2020", query: "year:2010..2020 show:authors,year,doi" },
  { label: "Notes citing DESeq2", query: "cites:love2014moderated" },
  { label: "Notes mentioning a GEO series", query: "mentions:GSE*" },
  { label: "Reviews linking to a script", query: "links:pipelines/normalize_counts.py" },
  { label: "Edited this month", query: "modified:>=2026-09" },
];

const SYNTAX: [string, string][] = [
  ["type:paper-review", "field equals value (any case)"],
  ["type:experiment,theorem", "any of these"],
  ["title:~deseq", "contains"],
  ["status:run*", "wildcard"],
  ["year:>=2020", "compare: > >= < <="],
  ["year:2019..2023", "range, inclusive"],
  ["has:doi  -has:dataset", "set / missing or empty"],
  ["tag:bio  #bio", "tag, including bio/…"],
  ["in:papers", "in a folder"],
  ['journal:"Genome Biology"', "quote spaces"],
  ["authors.0  meta.version", "list item or nested key"],
  ["-type:guide", "leave out matches"],
  ["deseq", "title or path contains"],
  ["sort:-year,title", "order; - for descending"],
  ["show:year,doi  limit:20", "columns, row count"],
];

export function QueryView({ initialQuery }: { initialQuery: string }) {
  const { index } = useWorkspace();
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const { result, error, loading } = useQueryResult(query);
  const parsed = useMemo(() => parseQuery(query), [query]);

  // Run and record in the URL once typing pauses, without a navigation per keystroke.
  useEffect(() => {
    if (draft === query) return;
    const timer = setTimeout(() => {
      setQuery(draft);
      window.history.replaceState(null, "", queryHref(draft));
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, query]);

  const run = (next: string) => {
    setDraft(next);
    setQuery(next);
    window.history.replaceState(null, "", queryHref(next));
  };

  const appendField = (field: string) => {
    const next = `${draft.trimEnd()}${draft.trim() ? " " : ""}${field}:`;
    setDraft(next);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      input?.focus();
      input?.setSelectionRange(next.length, next.length);
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Query</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Find notes by their frontmatter, tags, citations, IDs and links. Put a query in a note as a{" "}
        <code className="text-xs">```query</code> block to keep a live table there.
      </p>

      <div className="relative">
        <ListFilter className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(draft);
            if (e.key === "Escape") run("");
          }}
          placeholder="type:paper-review tag:scrna-seq -has:dataset sort:-year"
          aria-label="Query"
          spellCheck={false}
          autoFocus
          className="h-10 pl-9 font-mono text-sm"
        />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section aria-label="Results" className="min-w-0">
          <div className="mb-2 flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className={cn("text-muted-foreground tabular-nums", loading && "opacity-60")}>
              {result ? `${result.total} ${result.total === 1 ? "note" : "notes"}` : "Running…"}
            </span>
            <span className="ml-auto flex items-center">
              {result && result.rows.length > 0 && (
                <CopyButton className={LIGHT_COPY} label="Copy results as CSV" text="Copy CSV" getText={() => resultToCsv(result)} />
              )}
              <CopyButton
                className={LIGHT_COPY}
                label="Copy as a ```query block to paste into a note"
                text="Copy as note block"
                getText={() => `\`\`\`query\n${query.trim()}\n\`\`\`\n`}
              />
            </span>
          </div>
          {error && <p className="mb-2 text-sm text-destructive">Query failed: {error}</p>}
          {result && (
            <div className={cn("overflow-hidden rounded-xl border transition-opacity", loading && "opacity-60")}>
              <QueryTable result={result} sort={parsed.sort} onSort={(field, desc) => run(withSort(query, field, desc))} />
            </div>
          )}

          <h2 className="mt-8 mb-2 text-sm font-medium text-muted-foreground">Examples</h2>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <li key={ex.query}>
                <button
                  type="button"
                  onClick={() => run(ex.query)}
                  className="flex flex-col items-start rounded-lg border px-3 py-1.5 text-left hover:bg-muted"
                >
                  <span className="text-sm">{ex.label}</span>
                  <code className="text-xs text-muted-foreground">{ex.query}</code>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-6 text-sm">
          <section>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Fields</h2>
            <ul className="flex flex-wrap gap-1">
              {(index?.fields ?? []).map((f) => (
                <li key={f.name}>
                  <FieldChip name={f.name} count={f.count} onClick={() => appendField(f.name)} />
                </li>
              ))}
            </ul>
            <ul className="mt-2 flex flex-wrap gap-1 border-t pt-2">
              {Object.entries(VIRTUAL_FIELDS)
                .filter(([name]) => !index?.fields.some((f) => f.name === name))
                .map(([name, description]) => (
                  <li key={name}>
                    <FieldChip name={name} title={description} onClick={() => appendField(name)} computed />
                  </li>
                ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Syntax</h2>
            <dl className="space-y-1.5">
              {SYNTAX.map(([example, meaning]) => (
                <div key={example}>
                  <dt>
                    <code className="text-xs">{example}</code>
                  </dt>
                  <dd className="text-xs text-muted-foreground">{meaning}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Terms combine with AND. Dates compare by prefix, so <code>date:&lt;=2026-09</code> includes all of
              September.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function FieldChip({
  name,
  count,
  title,
  computed,
  onClick,
}: {
  name: string;
  count?: number;
  title?: string;
  computed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? `Add ${name}: to the query`}
      className={cn(
        "flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-xs hover:bg-muted",
        computed && "border-dashed",
      )}
    >
      {name}
      {count !== undefined && <span className="text-muted-foreground tabular-nums">{count}</span>}
    </button>
  );
}
