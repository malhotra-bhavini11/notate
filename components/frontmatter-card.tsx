"use client";

import { Calendar, ExternalLink, Hash, Plus, Shapes, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { accessionForField } from "@/lib/accessions";
import { tagHref } from "@/lib/paths";
import { NOTE_TEMPLATES } from "@/lib/templates";
import type { Frontmatter } from "@/lib/types";
import { toTags } from "@/lib/values";

interface FrontmatterCardProps {
  frontmatter: Frontmatter;
  onChange: (next: Frontmatter) => void;
}

const CORE_KEYS = new Set(["title", "type", "tags", "date"]);
const KNOWN_TYPES = Array.from(new Set(NOTE_TEMPLATES.map((t) => t.frontmatter("", "").type).filter(Boolean)));

type Scalar = string | number | boolean;
const isScalar = (v: unknown): v is Scalar => ["string", "number", "boolean"].includes(typeof v);
const isScalarList = (v: unknown): v is Scalar[] => Array.isArray(v) && v.every(isScalar);

/** Renders YAML frontmatter as an editable header instead of raw `---` text. */
export function FrontmatterCard({ frontmatter, onChange }: FrontmatterCardProps) {
  const set = (key: string, value: unknown) => onChange({ ...frontmatter, [key]: value });
  const remove = (key: string) => {
    const next = { ...frontmatter };
    delete next[key];
    onChange(next);
  };

  const title = typeof frontmatter.title === "string" ? frontmatter.title : "";
  const type = isScalar(frontmatter.type) ? String(frontmatter.type) : "";
  const date = isScalar(frontmatter.date) ? String(frontmatter.date) : "";
  const extraKeys = Object.keys(frontmatter).filter((k) => !CORE_KEYS.has(k));

  return (
    <section aria-label="Frontmatter" className="mb-6 rounded-xl border bg-muted/30 p-4">
      <input
        value={title}
        onChange={(e) => set("title", e.target.value)}
        placeholder="Untitled"
        aria-label="Title"
        className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-1.5">
          <Shapes className="size-3.5 text-muted-foreground" />
          <span className="sr-only">Type</span>
          <input
            list="note-types"
            value={type}
            onChange={(e) => set("type", e.target.value)}
            placeholder="type"
            className="w-36 rounded-md bg-transparent px-1 py-0.5 outline-none hover:bg-muted focus:bg-muted"
          />
          <datalist id="note-types">
            {KNOWN_TYPES.map((t) => (
              <option key={String(t)} value={String(t)} />
            ))}
          </datalist>
        </label>

        <label className="flex items-center gap-1.5">
          <Calendar className="size-3.5 text-muted-foreground" />
          <span className="sr-only">Date</span>
          <input
            type={/^\d{4}-\d{2}-\d{2}$/.test(date) || date === "" ? "date" : "text"}
            value={date}
            onChange={(e) => set("date", e.target.value)}
            className="rounded-md bg-transparent px-1 py-0.5 outline-none hover:bg-muted focus:bg-muted"
          />
        </label>

        <TagEditor tags={toTags(frontmatter.tags)} onChange={(tags) => set("tags", tags)} />
      </div>

      {extraKeys.length > 0 && (
        <dl className="mt-3 grid grid-cols-[max-content_1fr_auto] items-center gap-x-3 gap-y-1 border-t pt-3 text-sm">
          {extraKeys.map((key) => (
            <ExtraField
              key={key}
              name={key}
              value={frontmatter[key]}
              onCommit={(v) => set(key, v)}
              onRemove={() => remove(key)}
            />
          ))}
        </dl>
      )}

      <AddField existing={Object.keys(frontmatter)} onAdd={(key) => set(key, "")} />
    </section>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const incoming = toTags(draft).filter((t) => !tags.includes(t));
    if (incoming.length) onChange([...tags, ...incoming]);
    setDraft("");
  };

  return (
    // min-w keeps tags from squeezing to zero in narrow panes; the row wraps them below instead.
    <div className="flex min-w-48 flex-1 flex-wrap items-center gap-1">
      <Hash className="size-3.5 text-muted-foreground" />
      {tags.map((tag) => (
        <Badge key={tag} variant="outline" className="gap-0.5 pr-0.5">
          <Link href={tagHref(tag)} className="hover:underline" title={`Notes tagged #${tag}`}>
            {tag}
          </Link>
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`Remove tag ${tag}`}
            className="rounded-full p-0.5 hover:bg-muted"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && draft === "" && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={tags.length ? "" : "add tags"}
        aria-label="Add tag"
        className="w-24 min-w-0 flex-1 bg-transparent px-1 py-0.5 outline-none"
      />
    </div>
  );
}

// Lists whose items contain commas ("Love, Michael I") are edited with `;`
// separators, so editing an author list can't split names apart.
const listSeparator = (items: Scalar[]) => (items.some((v) => String(v).includes(",")) ? "; " : ", ");

function splitList(draft: string, original: Scalar[]): string[] {
  const separator = draft.includes(";") || listSeparator(original) === "; " ? ";" : ",";
  return draft
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatValue(value: unknown): string {
  if (isScalarList(value)) return value.join(listSeparator(value));
  if (isScalar(value)) return String(value);
  return "";
}

/** Keeps a local draft so typing `a, ` in a list field isn't normalised away mid-keystroke. */
function ExtraField({
  name,
  value,
  onCommit,
  onRemove,
}: {
  name: string;
  value: unknown;
  onCommit: (v: unknown) => void;
  onRemove: () => void;
}) {
  const editable = value === null || isScalar(value) || isScalarList(value);
  // `doi: 10.1186/…` or `geo: GSE60450` get a link to the database.
  const accession = accessionForField(name, value);
  const [draft, setDraft] = useState(formatValue(value));

  const commit = () => {
    if (draft === formatValue(value)) return;
    if (isScalarList(value)) onCommit(splitList(draft, value));
    else if (typeof value === "number" && draft.trim() !== "" && !Number.isNaN(Number(draft))) onCommit(Number(draft));
    else if (typeof value === "boolean" && /^(true|false)$/i.test(draft)) onCommit(draft.toLowerCase() === "true");
    else onCommit(draft);
  };

  return (
    <>
      <dt className="font-mono text-xs text-muted-foreground">{name}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        {editable ? (
          <>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              placeholder={isScalarList(value) ? "comma, separated" : "—"}
              className="w-full min-w-0 rounded-md bg-transparent px-1 py-0.5 outline-none hover:bg-muted focus:bg-muted"
            />
            {accession && (
              <a
                href={accession.url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`Open ${accession.id} in ${accession.type.name}`}
                title={`Open in ${accession.type.name}`}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </>
        ) : (
          <code className="block truncate px-1 text-xs" title={JSON.stringify(value)}>
            {JSON.stringify(value)}
          </code>
        )}
      </dd>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove field ${name}`}
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </>
  );
}

function AddField({ existing, onAdd }: { existing: string[]; onAdd: (key: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3" />
        Add field
      </button>
    );
  }

  const key = name.trim().replace(/\s+/g, "_");
  const invalid = !key || existing.includes(key);

  return (
    <form
      className="mt-2 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        onAdd(key);
        setName("");
        setAdding(false);
      }}
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
        onBlur={() => !name && setAdding(false)}
        placeholder="field name, e.g. doi"
        className="h-7 w-48 font-mono text-xs"
      />
      <span className="text-xs text-muted-foreground">Enter to add</span>
    </form>
  );
}
