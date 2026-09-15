"use client";

import { BookOpen, ExternalLink, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/components/workspace-provider";
import { CITEKEY_RE } from "@/lib/citations/citekey";
import { buildReadingNote, readingNotePath } from "@/lib/citations/reading-note";
import { noteApiUrl, noteHref, referencesHref } from "@/lib/paths";
import type { LookupResponse, ReferenceDTO } from "@/lib/types";

const today = () => new Date().toLocaleDateString("en-CA");

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export function ImportCitationDialog() {
  const { citationImport, closeCitationImport } = useWorkspace();
  return (
    <Dialog open={citationImport !== null} onOpenChange={(open) => !open && closeCitationImport()}>
      <DialogContent className="sm:max-w-xl">
        {citationImport && (
          <ImportCitationForm key={citationImport.id} initialQuery={citationImport.query ?? ""} onDone={closeCitationImport} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportCitationForm({ initialQuery, onDone }: { initialQuery: string; onDone: () => void }) {
  const router = useRouter();
  const { references, index, refresh } = useWorkspace();
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<LookupResponse | null>(null);
  const [key, setKey] = useState("");
  const [createNote, setCreateNote] = useState(true);
  const [busy, setBusy] = useState<"lookup" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy("lookup");
    setError(null);
    setResult(null);
    try {
      const found = await postJson<LookupResponse>("/api/citations/lookup", { query });
      setResult(found);
      setKey(found.reference.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const existing = result?.existingKey;
  const existingNote = existing ? index?.notes.find((n) => n.citekey === existing) : undefined;
  const keyTaken = !existing && references?.entries.some((e) => e.key.toLowerCase() === key.toLowerCase());
  const keyInvalid = !CITEKEY_RE.test(key);

  async function openOrCreateNote(ref: ReferenceDTO) {
    const note = index?.notes.find((n) => n.citekey === ref.key);
    if (note) return noteHref(note.path);
    const path = readingNotePath(ref.key);
    try {
      await postJson(noteApiUrl(path), buildReadingNote(ref, today()));
    } catch (err) {
      // A note already at that path (e.g. created earlier by hand) is fine to open.
      if (!(err instanceof Error && /already exists/.test(err.message))) throw err;
    }
    return noteHref(path);
  }

  async function add() {
    if (!result) return;
    setBusy("add");
    setError(null);
    try {
      const { reference } = existing
        ? { reference: result.reference }
        : await postJson<{ reference: ReferenceDTO }>("/api/references", { query, key });
      // Abstracts aren't stored in the .bib, so entries already in the library lack one; use the looked-up copy.
      const target =
        createNote || existing
          ? await openOrCreateNote({ ...reference, abstract: reference.abstract ?? result.reference.abstract })
          : referencesHref(reference.key);
      await refresh();
      onDone();
      router.push(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const ref = result?.reference;

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Import citation</DialogTitle>
        <DialogDescription>
          Paste a DOI, PubMed ID, PMC ID, arXiv ID, or a link to one. The reference is added to{" "}
          <span className="font-mono">references.bib</span>.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={lookup} className="flex gap-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="10.1186/s13059-014-0550-8 · PMID 25516281 · arXiv:1706.03762"
          aria-label="Identifier"
          className="font-mono text-xs"
        />
        <Button type="submit" variant="outline" disabled={!query.trim() || busy !== null}>
          <Search />
          {busy === "lookup" ? "Looking up…" : "Look up"}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {ref && (
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
          <div>
            <p className="font-medium leading-snug">{ref.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {ref.authors.slice(0, 3).map((a) => a.split(",")[0]).join(", ")}
              {ref.authors.length > 3 && ` +${ref.authors.length - 3}`}
              {ref.year && ` · ${ref.year}`}
              {ref.container && ` · ${ref.container}`}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-xs text-muted-foreground">
              <span>{result.identifier}</span>
              {ref.doi && (
                <a href={`https://doi.org/${ref.doi}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  doi <ExternalLink className="size-3" />
                </a>
              )}
              {ref.pmid && <span>PMID {ref.pmid}</span>}
              {ref.arxiv && <span>arXiv {ref.arxiv}</span>}
            </p>
          </div>

          {ref.abstract && <p className="line-clamp-3 text-xs text-muted-foreground">{ref.abstract}</p>}

          {existing ? (
            <p className="flex items-center gap-2 text-sm">
              <BookOpen className="size-4 text-emerald-600" />
              Already in your library as <code className="rounded bg-muted px-1">@{existing}</code>
            </p>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="citekey">Citation key</Label>
              <Input
                id="citekey"
                value={key}
                onChange={(e) => setKey(e.target.value.trim())}
                aria-invalid={keyInvalid || keyTaken || undefined}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {keyInvalid
                  ? "Use letters, digits, and _ : . - / (no spaces)."
                  : keyTaken
                    ? `@${key} is already used.`
                    : <>Cite it in notes as <code>[@{key}]</code>.</>}
              </p>
            </div>
          )}

          {!existing && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createNote} onChange={(e) => setCreateNote(e.target.checked)} />
              Create a reading note at <span className="font-mono text-xs">{readingNotePath(key || "reference")}</span>
            </label>
          )}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        {ref && (
          <Button type="button" onClick={add} disabled={busy !== null || (!existing && (keyInvalid || keyTaken))}>
            {busy === "add"
              ? "Adding…"
              : existing
                ? existingNote
                  ? "Open reading note"
                  : "Create reading note"
                : createNote
                  ? "Add and create note"
                  : "Add to references"}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
