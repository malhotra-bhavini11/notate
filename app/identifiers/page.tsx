"use client";

import { ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/components/workspace-provider";
import { ACCESSION_TYPES, type AccessionCategory, type AccessionType, parseAccessionRef } from "@/lib/accessions";
import { noteHref } from "@/lib/paths";
import type { NoteSummary } from "@/lib/types";

interface Row {
  ref: string;
  id: string;
  url: string;
  type: AccessionType;
  notes: NoteSummary[];
}

const CATEGORY_ORDER = [...new Set(ACCESSION_TYPES.map((t) => t.category))];

/** Every database identifier mentioned in notes, grouped by kind, with the notes that mention it. */
export default function IdentifiersPage() {
  const { index } = useWorkspace();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const rows = new Map<string, Row>();
    for (const note of index?.notes ?? []) {
      for (const ref of note.accessions) {
        const parsed = parseAccessionRef(ref);
        if (!parsed) continue;
        const row = rows.get(ref) ?? { ref, ...parsed, notes: [] };
        row.notes.push(note);
        rows.set(ref, row);
      }
    }
    const q = query.trim().toLowerCase();
    const visible = [...rows.values()].filter(
      (r) => !q || [r.id, r.type.name, r.type.description, ...r.notes.map((n) => n.title)].some((v) => v.toLowerCase().includes(q)),
    );
    const byCategory = new Map<AccessionCategory, Row[]>();
    for (const row of visible) byCategory.set(row.type.category, [...(byCategory.get(row.type.category) ?? []), row]);
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => ({
      category,
      rows: byCategory.get(category)!.sort((a, b) => a.type.name.localeCompare(b.type.name) || a.id.localeCompare(b.id, undefined, { numeric: true })),
    }));
  }, [index, query]);

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Identifiers</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Datasets, genes, proteins, variants, and other database IDs mentioned in your notes. They link automatically when
        you write them, e.g. <code className="text-xs">GSE60450</code>, <code className="text-xs">ENSG00000141510</code>,{" "}
        <code className="text-xs">rs334</code>, <code className="text-xs">PDB 1TUP</code>.
      </p>

      {index && (
        <div className="relative mb-6">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by ID, database, or note…"
            aria-label="Filter identifiers"
            className="pl-8"
          />
        </div>
      )}

      {!index && <p className="text-sm text-muted-foreground">Loading…</p>}
      {index && total === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {query ? "Nothing matches." : "No identifiers in your notes yet."}
        </p>
      )}

      {groups.map(({ category, rows }) => (
        <section key={category} className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">{category}</h2>
          <ul className="divide-y rounded-xl border">
            {rows.map((row) => (
              <li key={row.ref} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-mono text-sm text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {row.id}
                  <ExternalLink className="size-3" />
                </a>
                <span className="text-xs text-muted-foreground" title={row.type.description}>
                  {row.type.name}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {row.notes.map((n, i) => (
                    <span key={n.path}>
                      {i > 0 && ", "}
                      <Link href={noteHref(n.path)} className="text-foreground hover:underline">
                        {n.title}
                      </Link>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
