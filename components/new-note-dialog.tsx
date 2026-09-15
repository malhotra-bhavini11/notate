"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type NewNoteRequest, useWorkspace } from "@/components/workspace-provider";
import { noteApiUrl, noteHref, slugifyFileName } from "@/lib/paths";
import { NOTE_TEMPLATES, getTemplate } from "@/lib/templates";
import type { Frontmatter, SaveNoteBody } from "@/lib/types";
import { cn } from "@/lib/utils";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

/** Template frontmatter with presets placed right after the title (e.g. `source`). */
function mergeFrontmatter(base: Frontmatter, preset: Frontmatter = {}): Frontmatter {
  const merged: Frontmatter = { title: base.title, ...preset };
  for (const [key, value] of Object.entries(base)) if (!(key in merged)) merged[key] = value;
  return merged;
}

export function NewNoteDialog() {
  const { newNote, closeNewNote } = useWorkspace();
  return (
    <Dialog open={newNote !== null} onOpenChange={(open) => !open && closeNewNote()}>
      <DialogContent className="sm:max-w-lg">
        {newNote && <NewNoteForm key={newNote.id} request={newNote} onDone={closeNewNote} />}
      </DialogContent>
    </Dialog>
  );
}

function NewNoteForm({ request, onDone }: { request: NewNoteRequest; onDone: () => void }) {
  const router = useRouter();
  const { refresh } = useWorkspace();
  const initialTemplate = getTemplate(request.templateId ?? "paper-review");
  const [templateId, setTemplateId] = useState(initialTemplate.id);
  const [title, setTitle] = useState(request.title ?? "");
  const [folder, setFolder] = useState(initialTemplate.folder);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fileName = `${slugifyFileName(title)}.md`;
  const cleanFolder = folder
    .split(/[\\/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
  const notePath = cleanFolder ? `${cleanFolder}/${fileName}` : fileName;

  function chooseTemplate(id: string) {
    setTemplateId(id);
    setFolder(getTemplate(id).folder);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const template = getTemplate(templateId);
    const body: SaveNoteBody = {
      frontmatter: mergeFrontmatter(template.frontmatter(title.trim(), today()), request.frontmatter),
      content: template.body(title.trim()),
      createOnly: true,
    };

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(noteApiUrl(notePath), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      await refresh();
      onDone();
      router.push(request.hrefAfterCreate ? request.hrefAfterCreate(notePath) : noteHref(notePath));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const source = typeof request.frontmatter?.source === "string" ? request.frontmatter.source : null;

  return (
    <form onSubmit={create} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>New note</DialogTitle>
        <DialogDescription>
          {source ? (
            <>
              Linked to <span className="font-mono">{source}</span> via the <span className="font-mono">source</span>{" "}
              field, so it opens beside the file in split view.
            </>
          ) : (
            "Pick a template. The note is saved as a Markdown file in your workspace."
          )}
        </DialogDescription>
      </DialogHeader>

      <div role="radiogroup" aria-label="Template" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {NOTE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={t.id === templateId}
            onClick={() => chooseTemplate(t.id)}
            className={cn(
              "rounded-lg border p-2.5 text-left transition-colors hover:bg-muted",
              t.id === templateId && "border-foreground/40 bg-muted",
            )}
          >
            <div className="text-sm font-medium">{t.label}</div>
            <div className="text-xs text-muted-foreground">{t.description}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="note-title">Title</Label>
        <Input
          id="note-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. DESeq2 – Love et al. 2014"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="note-folder">Folder</Label>
        <Input
          id="note-folder"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="(workspace root)"
        />
        <p className="font-mono text-xs text-muted-foreground">workspace/{notePath}</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!title.trim() || saving}>
          {saving ? "Creating…" : "Create note"}
        </Button>
      </DialogFooter>
    </form>
  );
}
