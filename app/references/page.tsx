"use client";

import { BookPlus, ExternalLink, FileText, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CopyButton } from "@/components/code-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/components/workspace-provider";
import { buildReadingNote, readingNotePath } from "@/lib/citations/reading-note";
import { fileHref, noteApiUrl, noteHref } from "@/lib/paths";
import type { NoteSummary, ReferenceDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const LIGHT_COPY = "h-7 text-muted-foreground hover:bg-muted hover:text-foreground";

export default function ReferencesPage() {
  const { references, index, openCitationImport } = useWorkspace();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...(references?.entries ?? [])].reverse(); // newest imports first
    if (!q) return all;
    return all.filter((e) =>
      [e.key, e.title, e.container, e.year?.toString(), e.doi, ...e.authors].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [references, query]);

  // Entries render after data loads, so jump to `#key` ourselves.
  useEffect(() => {
    if (!references) return;
    const key = decodeURIComponent(window.location.hash.slice(1));
    const el = key ? document.getElementById(`ref-${key}`) : null;
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    const show = setTimeout(() => setHighlighted(key), 0);
    const hide = setTimeout(() => setHighlighted(null), 2000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [references]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">References</h1>
          <p className="text-sm text-muted-foreground">
            {references ? `${references.entries.length} entries in ` : "Loading "}
            <Link href={fileHref("references.bib")} className="font-mono hover:underline">
              references.bib
            </Link>
            . Cite with <code className="text-xs">[@key]</code>.
          </p>
        </div>
        <Button onClick={() => openCitationImport()}>
          <BookPlus />
          Import citation
        </Button>
      </div>

      {references?.error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{references.error}</p>
      )}

      {references && references.entries.length > 0 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by author, title, year, key, DOI…"
            aria-label="Filter references"
            className="pl-8"
          />
        </div>
      )}

      {references?.entries.length === 0 && !references.error && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No references yet. Import one by DOI, PubMed ID, or arXiv ID.
        </p>
      )}

      <ul className="grid gap-3">
        {entries.map((entry) => (
          <ReferenceCard
            key={entry.key}
            entry={entry}
            notes={index?.notes ?? []}
            highlighted={highlighted === entry.key}
          />
        ))}
      </ul>
    </div>
  );
}

function ReferenceCard({ entry, notes, highlighted }: { entry: ReferenceDTO; notes: NoteSummary[]; highlighted: boolean }) {
  const router = useRouter();
  const { refresh } = useWorkspace();
  const [error, setError] = useState<string | null>(null);
  const readingNote = notes.find((n) => n.citekey === entry.key);
  // Reading notes cite their own key on the first line; that isn't a citation worth listing.
  const citedIn = notes.filter((n) => n.citations.includes(entry.key) && n.citekey !== entry.key);

  async function createNote() {
    setError(null);
    const path = readingNotePath(entry.key);
    const res = await fetch(noteApiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildReadingNote(entry, new Date().toLocaleDateString("en-CA"))),
    });
    if (!res.ok && res.status !== 409) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't create the note");
      return;
    }
    await refresh();
    router.push(noteHref(path));
  }

  return (
    <li
      id={`ref-${entry.key}`}
      className={cn("scroll-mt-4 rounded-xl border bg-card p-4 transition-shadow", highlighted && "ring-2 ring-sky-500")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">@{entry.key}</code>
        <div className="flex flex-wrap items-center gap-0.5">
          <CopyButton className={LIGHT_COPY} label={`Copy [@${entry.key}]`} text="Key" getText={() => `[@${entry.key}]`} />
          <CopyButton className={LIGHT_COPY} label="Copy BibTeX entry" text="BibTeX" getText={() => entry.bibtex} />
          {readingNote ? (
            <Button size="sm" variant="outline" render={<Link href={noteHref(readingNote.path)} />} nativeButton={false}>
              <FileText />
              Reading note
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void createNote()}>
              <FileText />
              Create note
            </Button>
          )}
        </div>
      </div>

      <p className="mt-2 text-sm leading-relaxed">{entry.formatted}</p>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {entry.doi && <ExternalId href={`https://doi.org/${entry.doi}`} label={`doi:${entry.doi}`} />}
        {entry.pmid && <ExternalId href={`https://pubmed.ncbi.nlm.nih.gov/${entry.pmid}/`} label={`PMID ${entry.pmid}`} />}
        {entry.pmcid && <ExternalId href={`https://pmc.ncbi.nlm.nih.gov/articles/${entry.pmcid}/`} label={entry.pmcid} />}
        {entry.arxiv && <ExternalId href={`https://arxiv.org/abs/${entry.arxiv}`} label={`arXiv:${entry.arxiv}`} />}
      </div>

      {citedIn.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Cited in{" "}
          {citedIn.map((n, i) => (
            <span key={n.path}>
              {i > 0 && ", "}
              <Link href={noteHref(n.path)} className="text-foreground hover:underline">
                {n.title}
              </Link>
            </span>
          ))}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </li>
  );
}

function ExternalId({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-mono hover:text-foreground hover:underline">
      {label}
      <ExternalLink className="size-3" />
    </a>
  );
}
