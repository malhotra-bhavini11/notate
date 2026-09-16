"use client";

import { ArrowDown, ArrowUp, ExternalLink, ListFilter } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

import { CopyButton } from "@/components/code-block";
import { useWorkspace } from "@/components/workspace-provider";
import { accessionForField, parseAccessionRef } from "@/lib/accessions";
import { hrefForFile, noteHref, queryApiUrl, queryHref, referencesHref, tagHref } from "@/lib/paths";
import { cellText, isoDate, type QueryResult, resultToCsv, type SortKey, VIRTUAL_FIELDS } from "@/lib/query";
import { cn } from "@/lib/utils";

export const LIGHT_COPY = "h-7 text-muted-foreground hover:bg-muted hover:text-foreground";

interface QueryState {
  result: QueryResult | null;
  error: string | null;
  loading: boolean;
}

/** Runs `query` on the server; re-runs when the workspace index refreshes (saves, tab focus). */
export function useQueryResult(query: string): QueryState {
  const { index } = useWorkspace();
  const [state, setState] = useState<QueryState>({ result: null, error: null, loading: true });

  useEffect(() => {
    const controller = new AbortController();
    fetch(queryApiUrl(query), { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        setState({ result: json, error: null, loading: false });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err), loading: false }));
      });
    return () => controller.abort();
  }, [query, index]);

  return state;
}

/** Live table for a ```query fence in a note. */
export function QueryBlock({ query, title }: { query: string; title?: string }) {
  const { result, error } = useQueryResult(query);

  return (
    <div className="not-prose my-5 overflow-hidden rounded-xl border">
      <div className="flex min-h-9 items-center gap-2 border-b bg-muted/40 py-1 pr-1.5 pl-3 text-xs">
        <ListFilter className="size-3.5 shrink-0 text-muted-foreground" />
        {title ? (
          <span className="min-w-0 truncate font-medium" title={query}>
            {title}
          </span>
        ) : (
          <code className="min-w-0 truncate text-muted-foreground" title={query}>
            {query || "(every note)"}
          </code>
        )}
        {result && (
          <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
            {result.total} {result.total === 1 ? "note" : "notes"}
          </span>
        )}
        <span className={cn("flex shrink-0 items-center", !result && "ml-auto")}>
          {result && result.rows.length > 0 && (
            <CopyButton className={LIGHT_COPY} label="Copy results as CSV" text="CSV" getText={() => resultToCsv(result)} />
          )}
          <Link
            href={queryHref(query)}
            title="Open in Query"
            aria-label="Open in Query"
            className="flex h-7 items-center rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </Link>
        </span>
      </div>
      {error && <p className="px-3 py-2 text-sm text-destructive">Query failed: {error}</p>}
      {!result && !error && <p className="px-3 py-2 text-sm text-muted-foreground">Running query…</p>}
      {result && <QueryTable result={result} />}
    </div>
  );
}

interface QueryTableProps {
  result: QueryResult;
  /** Current sort, to mark the header; clicking a header calls `onSort`. */
  sort?: SortKey[];
  onSort?: (field: string, desc: boolean) => void;
}

export function QueryTable({ result, sort, onSort }: QueryTableProps) {
  const { index } = useWorkspace();
  // Values naming a workspace note or file become links.
  const titles = useMemo(() => new Map((index?.notes ?? []).map((n) => [n.path, n.title])), [index]);
  const files = useMemo(() => new Set(index?.files ?? []), [index]);
  const active = sort?.[0];

  const header = (field: string, label: string) => {
    const isActive = active?.field === field;
    if (!onSort) return label;
    return (
      <button
        type="button"
        onClick={() => onSort(field, isActive ? !active.desc : field === "modified")}
        className="inline-flex items-center gap-1 hover:text-foreground"
        title={VIRTUAL_FIELDS[field] ? `${field}: ${VIRTUAL_FIELDS[field]}` : `Sort by ${field}`}
      >
        {label}
        {isActive && (active.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    );
  };

  return (
    <>
      {result.errors.length > 0 && (
        <ul className="border-b bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          {result.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-1.5 font-medium whitespace-nowrap">{header("title", "Note")}</th>
              {result.columns.map((c) => (
                <th key={c} className="px-3 py-1.5 font-mono font-normal whitespace-nowrap">
                  {header(c, c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {result.rows.map((row) => (
              <tr key={row.path} className="align-top hover:bg-muted/30">
                <td className="max-w-80 px-3 py-1.5">
                  <Link href={noteHref(row.path)} className="font-medium hover:underline" title={row.path}>
                    {row.title}
                  </Link>
                </td>
                {result.columns.map((c) => (
                  <td key={c} className="max-w-72 px-3 py-1.5">
                    <Cell column={c} value={row.values[c]} titles={titles} files={files} />
                  </td>
                ))}
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={result.columns.length + 1} className="px-3 py-4 text-center text-muted-foreground">
                  No notes match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {result.rows.length < result.total && (
        <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
          Showing {result.rows.length} of {result.total}.
        </p>
      )}
    </>
  );
}

const EMPTY = <span className="text-muted-foreground/50">—</span>;

function Cell({
  column,
  value,
  titles,
  files,
}: {
  column: string;
  value: unknown;
  titles: Map<string, string>;
  files: Set<string>;
}) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return EMPTY;

  if (column === "modified" && typeof value === "number") {
    return (
      <time dateTime={new Date(value).toISOString()} title={new Date(value).toLocaleString()} className="whitespace-nowrap tabular-nums">
        {isoDate(value)}
      </time>
    );
  }

  if (Array.isArray(value)) {
    return (
      <span className={cn(column === "tags" && "flex flex-wrap gap-1")}>
        {value.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && column !== "tags" && ", "}
            <Item column={column} value={item} titles={titles} files={files} />
          </Fragment>
        ))}
      </span>
    );
  }
  return <Item column={column} value={value} titles={titles} files={files} />;
}

function Item({
  column,
  value,
  titles,
  files,
}: {
  column: string;
  value: unknown;
  titles: Map<string, string>;
  files: Set<string>;
}) {
  if (typeof value === "object" && value !== null) {
    return <code className="text-xs break-all">{cellText(column, value)}</code>;
  }
  const text = String(value);

  if (column === "tags") {
    return (
      <Link href={tagHref(text)} className="rounded-full border px-1.5 text-xs whitespace-nowrap hover:bg-muted">
        #{text}
      </Link>
    );
  }
  if (column === "cites") {
    return (
      <Link href={referencesHref(text)} className="font-mono text-xs hover:underline">
        @{text}
      </Link>
    );
  }
  if (column === "mentions") {
    const ref = parseAccessionRef(text);
    if (!ref) return text;
    return (
      <a href={ref.url} target="_blank" rel="noreferrer noopener" className="accession-link" title={ref.type.name}>
        {ref.id}
      </a>
    );
  }
  // `source: papers/x.pdf`, `links`, or any value naming a workspace file.
  if (titles.has(text) || files.has(text)) {
    return (
      <Link href={hrefForFile(text)} className="hover:underline" title={text}>
        {titles.get(text) ?? text.split("/").pop()}
      </Link>
    );
  }
  const accession = accessionForField(column, value);
  if (accession) {
    return (
      <a href={accession.url} target="_blank" rel="noreferrer noopener" className="accession-link" title={accession.type.name}>
        {text}
      </a>
    );
  }
  if (/^https?:\/\/\S+$/i.test(text)) {
    return (
      <a href={text} target="_blank" rel="noreferrer noopener" className="break-all hover:underline">
        {text}
      </a>
    );
  }
  return <span className="break-words">{text}</span>;
}
