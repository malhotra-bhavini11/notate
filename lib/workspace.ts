import "server-only";

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/** Thrown for any request that should map to a 4xx response. */
export class WorkspaceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 413 | 415,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

/** Directory names never shown in the tree nor reachable through the API. */
export const IGNORED_NAMES = new Set(["node_modules", "__pycache__"]);

// Windows device names are unusable as file names even with an extension.
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

// The turbopackIgnore hints stop the bundler from tracing the whole project
// into the server output; the workspace is user data resolved at runtime.
export function getWorkspaceRoot(): string {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.WORKSPACE_DIR ?? path.join(process.cwd(), "workspace"),
  );
}

const seeding = new Map<string, Promise<string>>();

/**
 * Creates the workspace on first use, copying in the bundled sample notes so a
 * fresh checkout has something to look at. An existing workspace is left alone.
 * The app's first page load fires several API calls at once, so concurrent
 * callers share one seeding promise instead of racing to copy.
 */
export function ensureWorkspace(): Promise<string> {
  const root = getWorkspaceRoot();
  if (existsSync(root)) return Promise.resolve(root);

  let pending = seeding.get(root);
  if (!pending) {
    pending = seedWorkspace(root).finally(() => seeding.delete(root));
    seeding.set(root, pending);
  }
  return pending;
}

async function seedWorkspace(root: string): Promise<string> {
  const samples = path.join(/*turbopackIgnore: true*/ process.cwd(), "samples", "workspace");
  try {
    if (existsSync(samples)) {
      await fs.cp(samples, root, { recursive: true, force: false, errorOnExist: false });
    } else {
      await fs.mkdir(root, { recursive: true });
    }
  } catch (err) {
    // Another process (e.g. a second dev server) may have created it first.
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
  return root;
}

function validateSegment(segment: string): void {
  if (
    segment.length === 0 ||
    segment === "." ||
    segment === ".." ||
    segment.startsWith(".") ||
    /[\\/:*?"<>|\0]/.test(segment) ||
    RESERVED_WINDOWS_NAME.test(segment) ||
    IGNORED_NAMES.has(segment)
  ) {
    throw new WorkspaceError(`Invalid path segment: ${JSON.stringify(segment)}`, 400);
  }
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Nearest ancestor of `target` (inclusive) that exists on disk. */
async function nearestExisting(target: string): Promise<string> {
  let current = target;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return fs.realpath(current);
}

export interface ResolvedPath {
  /** Absolute path on disk. */
  absolute: string;
  /** Workspace-relative path with forward slashes, e.g. `papers/attention.md`. */
  relative: string;
}

/**
 * Maps URL slug segments to a file inside the workspace. Rejects traversal,
 * hidden files, Windows-special names, and symlinks that escape the root, so the
 * API can never read or write outside `WORKSPACE_DIR`.
 */
export async function resolveInWorkspace(segments: string[]): Promise<ResolvedPath> {
  if (segments.length === 0) throw new WorkspaceError("Empty path", 400);
  segments.forEach(validateSegment);

  const root = await ensureWorkspace();
  const absolute = path.resolve(root, ...segments);
  if (!isInside(root, absolute)) throw new WorkspaceError("Path escapes workspace", 403);

  const realRoot = await fs.realpath(root);
  const realTarget = await nearestExisting(absolute);
  if (!isInside(realRoot, realTarget)) throw new WorkspaceError("Path escapes workspace", 403);

  return { absolute, relative: segments.join("/") };
}

/**
 * Writes via a temp file + rename so a crash mid-save never leaves a truncated
 * note. OneDrive and antivirus can briefly lock files on Windows, so the rename
 * is retried before falling back to a direct write.
 */
export async function writeFileAtomic(absolute: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const tmp = path.join(
    path.dirname(absolute),
    `.${path.basename(absolute)}.${process.pid}.${Date.now()}.tmp`,
  );
  await fs.writeFile(tmp, data, "utf8");

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.rename(tmp, absolute);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") {
        await fs.rm(tmp, { force: true });
        throw err;
      }
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
  await fs.rm(tmp, { force: true });
  await fs.writeFile(absolute, data, "utf8");
}
