import "server-only";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { HistoryCommit, HistoryStatusDTO } from "./types";
import { ensureWorkspace, resolveInWorkspace, WorkspaceError, writeFileAtomic } from "./workspace";

const execFileAsync = promisify(execFile);

/** How long after an edit the automatic snapshot runs, coalescing a burst of saves. */
export const SNAPSHOT_SECONDS = Math.max(5, Number(process.env.NOTATE_SNAPSHOT_SECONDS ?? 120));
const AUTO_SNAPSHOTS = process.env.NOTATE_HISTORY !== "off";
const IDENTITY = ["-c", "user.name=notate", "-c", "user.email=notate@localhost"];
// Separators git won't find in a commit subject or a path.
const RECORD = "\u001e";
const FIELD = "\u001f";

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

/**
 * The workspace's own repository, which is separate from the app's. Anything
 * else (no git, or a workspace that isn't tracked yet) is reported rather than
 * thrown: history is optional and the app works without it.
 */
async function repoRoot(): Promise<string | null> {
  const root = await ensureWorkspace();
  return (await fs.stat(path.join(root, ".git")).catch(() => null)) ? root : null;
}

async function requireRepo(): Promise<string> {
  const root = await repoRoot();
  if (!root) throw new WorkspaceError("History isn't turned on for this workspace", 409);
  return root;
}

// Git calls run one at a time: a snapshot must never interleave with another.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => {});
  return result;
}

const LOG_FORMAT = `--pretty=format:${RECORD}%H${FIELD}%aI${FIELD}%s`;

const parseCommits = (stdout: string): HistoryCommit[] =>
  stdout
    .split(RECORD)
    .filter((record) => record.trim())
    .map((record) => {
      const [header, ...rest] = record.split("\n");
      const [hash, date, subject] = header.split(FIELD);
      return { hash, short: hash.slice(0, 7), date, subject, files: rest.filter(Boolean) };
    });

/** Recent snapshots, newest first; `segments` limits them to one note's history. */
export async function listCommits(relPath?: string, limit = 50): Promise<HistoryCommit[]> {
  const root = await requireRepo();
  const args = ["log", `--max-count=${Math.min(Math.max(limit, 1), 200)}`, LOG_FORMAT, "--name-only"];
  // --follow keeps a note's history across renames, and takes only one path.
  if (relPath) args.push("--follow", "--", relPath);
  // A repository with no commits yet has no HEAD, which git reports as an error.
  return parseCommits(await git(args, root).catch(() => ""));
}

export async function getStatus(): Promise<HistoryStatusDTO> {
  const workspace = await ensureWorkspace();
  const base: HistoryStatusDTO = {
    git: true,
    tracked: false,
    pending: 0,
    commits: 0,
    snapshotSeconds: SNAPSHOT_SECONDS,
    auto: AUTO_SNAPSHOTS,
  };
  try {
    await git(["--version"], workspace);
  } catch {
    return { ...base, git: false, error: "git isn't installed, or isn't on PATH" };
  }

  const root = await repoRoot();
  if (!root) return base;

  const [porcelain, count, log, remote] = await Promise.all([
    git(["status", "--porcelain"], root).catch(() => ""),
    git(["rev-list", "--count", "HEAD"], root).catch(() => "0"),
    git(["log", "--max-count=1", LOG_FORMAT, "--name-only"], root).catch(() => ""),
    git(["remote", "get-url", "origin"], root).catch(() => ""),
  ]);
  return {
    ...base,
    tracked: true,
    pending: porcelain.split("\n").filter((line) => line.trim()).length,
    commits: Number(count.trim()) || 0,
    last: parseCommits(log)[0],
    remote: remote.trim() || undefined,
  };
}

// Atomic saves leave `.note.md.<pid>.<time>.tmp` behind if the app dies
// mid-write, and Windows and macOS drop their own files into folders.
const GITIGNORE = `# Written by notate when history was turned on.
*.tmp
.DS_Store
Thumbs.db
desktop.ini
`;

/** `git init` in the workspace, then a first snapshot of whatever is there. */
export async function initHistory(): Promise<HistoryStatusDTO> {
  return serial(async () => {
    const root = await ensureWorkspace();
    if (await repoRoot()) return getStatus();
    try {
      await git(["init", "-b", "main"], root);
    } catch {
      await git(["init"], root); // git before 2.28 has no -b
    }
    const gitignore = path.join(root, ".gitignore");
    if (!(await fs.stat(gitignore).catch(() => null))) await writeFileAtomic(gitignore, GITIGNORE);
    await commitAll(root, "Start tracking notes");
    return getStatus();
  });
}

/** "Update papers/deseq2.md", or "3 files: a.md, b.md, c.md". */
function describe(nameStatus: string): string {
  const changes = nameStatus
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      return { status: status[0], file: rest.at(-1) ?? "" };
    });
  if (changes.length === 0) return "No changes";
  const verb = ({ A: "Add", D: "Delete", R: "Rename" } as Record<string, string>)[changes[0].status] ?? "Update";
  if (changes.length === 1) return `${verb} ${changes[0].file}`;
  const names = changes.slice(0, 3).map((c) => c.file.split("/").pop()).join(", ");
  return `${changes.length} files: ${names}${changes.length > 3 ? ", …" : ""}`;
}

async function commitAll(root: string, subject?: string): Promise<HistoryCommit | null> {
  await git(["add", "-A"], root);
  const staged = await git(["diff", "--cached", "--name-status"], root);
  if (!staged.trim()) return null;
  await git([...IDENTITY, "commit", "-m", subject ?? describe(staged), "-m", staged.trim()], root);
  return parseCommits(await git(["log", "--max-count=1", LOG_FORMAT, "--name-only"], root))[0] ?? null;
}

/** Commits everything that changed; null when there was nothing to commit. */
export async function snapshot(subject?: string): Promise<HistoryCommit | null> {
  const root = await requireRepo();
  return serial(() => commitAll(root, subject));
}

let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * Called after every note write. Snapshots run on a delay, so a stretch of
 * editing becomes one commit instead of one per save.
 */
export function scheduleSnapshot(): void {
  if (!AUTO_SNAPSHOTS || pending) return;
  pending = setTimeout(() => {
    pending = null;
    void snapshot().catch((err) => console.warn("[history] snapshot failed:", err));
  }, SNAPSHOT_SECONDS * 1000);
  pending.unref?.(); // never hold the process open for a snapshot
}

const REVISION = /^[0-9a-f]{4,40}$/;

function assertRevision(rev: string): void {
  if (!REVISION.test(rev)) throw new WorkspaceError(`Not a snapshot id: ${rev}`, 400);
}

/** A note as it was at that snapshot. */
export async function readAtRevision(segments: string[], rev: string): Promise<{ path: string; content: string }> {
  assertRevision(rev);
  const { relative } = await resolveInWorkspace(segments);
  const root = await requireRepo();
  try {
    return { path: relative, content: await git(["show", `${rev}:${relative}`], root) };
  } catch {
    throw new WorkspaceError(`${relative} isn't in snapshot ${rev.slice(0, 7)}`, 404);
  }
}

/**
 * Writes an old version back as the current file. History is never rewritten,
 * so the restore becomes the next snapshot and can itself be undone.
 */
export async function restore(segments: string[], rev: string): Promise<{ path: string; content: string }> {
  const { path: relative, content } = await readAtRevision(segments, rev);
  const { absolute } = await resolveInWorkspace(segments);
  await writeFileAtomic(absolute, content);
  await snapshot(`Restore ${relative} to ${rev.slice(0, 7)}`);
  return { path: relative, content };
}
