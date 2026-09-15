import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { parseMarkdown, stringifyMarkdown } from "./frontmatter";
import { buildTree } from "./tree";
import { flattenTree } from "./tree-utils";
import { isPlainObject, toTags } from "./values";
import type { NoteDTO, NoteSummary, SaveNoteBody, SaveNoteResponse } from "./types";
import { ensureWorkspace, resolveInWorkspace, WorkspaceError, writeFileAtomic } from "./workspace";

/** Upper bound for a single note; markdown this large is almost certainly a mistake. */
export const MAX_NOTE_BYTES = 5 * 1024 * 1024;

function assertMarkdown(relative: string): void {
  if (path.extname(relative).toLowerCase() !== ".md") {
    throw new WorkspaceError("Notes must be .md files", 415);
  }
}

async function statOrNull(absolute: string) {
  try {
    return await fs.stat(absolute);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function readNote(segments: string[]): Promise<NoteDTO> {
  const { absolute, relative } = await resolveInWorkspace(segments);
  assertMarkdown(relative);

  const stat = await statOrNull(absolute);
  if (!stat || !stat.isFile()) throw new WorkspaceError(`Note not found: ${relative}`, 404);

  const raw = await fs.readFile(absolute, "utf8");
  return { path: relative, ...parseMarkdown(raw), mtime: stat.mtimeMs };
}

/** Validates an untrusted JSON body before anything touches disk. */
export function parseSaveBody(body: unknown): SaveNoteBody {
  if (!isPlainObject(body)) throw new WorkspaceError("Body must be a JSON object", 400);
  const { frontmatter, content, createOnly } = body;

  if (typeof content !== "string") throw new WorkspaceError("`content` must be a string", 400);
  if (frontmatter !== undefined && !isPlainObject(frontmatter)) {
    throw new WorkspaceError("`frontmatter` must be an object", 400);
  }
  if (createOnly !== undefined && typeof createOnly !== "boolean") {
    throw new WorkspaceError("`createOnly` must be a boolean", 400);
  }
  return { frontmatter, content, createOnly };
}

export async function writeNote(segments: string[], body: SaveNoteBody): Promise<SaveNoteResponse> {
  const { absolute, relative } = await resolveInWorkspace(segments);
  assertMarkdown(relative);

  const existing = await statOrNull(absolute);
  if (existing?.isDirectory()) throw new WorkspaceError(`${relative} is a directory`, 409);
  if (existing && body.createOnly) throw new WorkspaceError(`${relative} already exists`, 409);

  const data = stringifyMarkdown(body.frontmatter ?? {}, body.content);
  if (Buffer.byteLength(data, "utf8") > MAX_NOTE_BYTES) {
    throw new WorkspaceError("Note exceeds 5 MB", 413);
  }

  await writeFileAtomic(absolute, data);
  const stat = await fs.stat(absolute);
  return { ok: true, path: relative, mtime: stat.mtimeMs };
}

/** Most recently modified notes, with the frontmatter fields the dashboard shows. */
export async function listRecentNotes(limit = 20): Promise<NoteSummary[]> {
  const root = await ensureWorkspace();
  const files = flattenTree(await buildTree(root))
    .filter((f) => f.ext === "md")
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);

  return Promise.all(
    files.map(async (file): Promise<NoteSummary> => {
      const fallbackTitle = file.name.replace(/\.md$/i, "");
      try {
        const raw = await fs.readFile(path.join(root, ...file.path.split("/")), "utf8");
        const { frontmatter } = parseMarkdown(raw);
        return {
          path: file.path,
          title: typeof frontmatter.title === "string" ? frontmatter.title : fallbackTitle,
          type: typeof frontmatter.type === "string" ? frontmatter.type : undefined,
          tags: toTags(frontmatter.tags),
          mtime: file.mtime,
        };
      } catch {
        // Malformed YAML shouldn't hide the note from the dashboard.
        return { path: file.path, title: fallbackTitle, tags: [], mtime: file.mtime };
      }
    }),
  );
}
