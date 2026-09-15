// Shapes shared between the API routes and the client.

export type Frontmatter = Record<string, unknown>;

export interface TreeNode {
  name: string;
  /** Workspace-relative path with forward slashes. Empty string for the root. */
  path: string;
  type: "dir" | "file";
  /** Lower-case extension without the dot, e.g. `md`, `py`. Files only. */
  ext?: string;
  /** Last modified time in ms since epoch. */
  mtime: number;
  size?: number;
  children?: TreeNode[];
}

export interface NoteDTO {
  path: string;
  frontmatter: Frontmatter;
  content: string;
  mtime: number;
}

export interface NoteSummary {
  path: string;
  title: string;
  type?: string;
  tags: string[];
  mtime: number;
}

export interface IndexDTO {
  /** Every note, newest first. Tags include frontmatter and inline `#tags`. */
  notes: NoteSummary[];
  /** Non-note files (PDFs, code, data) that `[[file.ext]]` links can target. */
  files: string[];
  tags: { tag: string; count: number }[];
}

export interface BacklinkDTO {
  path: string;
  title: string;
  mentions: { line: number; context: string }[];
}

export interface SaveNoteBody {
  frontmatter?: Frontmatter;
  content: string;
  /** When true, fail with 409 instead of overwriting an existing file. */
  createOnly?: boolean;
}

export interface SaveNoteResponse {
  ok: true;
  path: string;
  mtime: number;
}

export interface ApiError {
  error: string;
}
