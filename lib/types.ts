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
  /** Citation keys referenced with [@key]. */
  citations: string[];
  /** Frontmatter `citekey`, set on reading notes created from a reference. */
  citekey?: string;
  /** Database identifiers mentioned in the body, as `database:id` (e.g. `geo:GSE60450`). */
  accessions: string[];
  mtime: number;
}

/** One bibliography entry, flattened from CSL-JSON for display. */
export interface ReferenceDTO {
  key: string;
  /** CSL type, e.g. `article-journal`, `article` (preprint), `book`. */
  type: string;
  title: string;
  /** "Family, Given" for each author, in order. */
  authors: string[];
  year?: number;
  container?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  arxiv?: string;
  url?: string;
  abstract?: string;
  /** Full APA reference, plain text. */
  formatted: string;
  /** In-text citation without parentheses, e.g. `Love et al., 2014`. */
  inText: string;
  bibtex: string;
}

export interface ReferencesDTO {
  entries: ReferenceDTO[];
  /** Set when references.bib exists but couldn't be parsed. */
  error?: string;
}

export interface LookupResponse {
  identifier: string;
  reference: ReferenceDTO;
  /** Key of an entry in references.bib with the same DOI/PMID/arXiv ID, if any. */
  existingKey?: string;
}

export interface IndexDTO {
  /** Every note, newest first. Tags include frontmatter and inline `#tags`. */
  notes: NoteSummary[];
  /** Non-note files (PDFs, code, data) that `[[file.ext]]` links can target. */
  files: string[];
  tags: { tag: string; count: number }[];
  /** Frontmatter keys with the number of notes that set them, for building queries. */
  fields: { name: string; count: number }[];
}

/** One snapshot in the workspace's history. */
export interface HistoryCommit {
  hash: string;
  short: string;
  /** ISO 8601, from git's author date. */
  date: string;
  subject: string;
  /** Workspace-relative paths changed in this snapshot. */
  files: string[];
}

export interface HistoryStatusDTO {
  /** git is installed and runnable. */
  git: boolean;
  /** The workspace has its own repository. */
  tracked: boolean;
  /** Files changed since the last snapshot. */
  pending: number;
  commits: number;
  last?: HistoryCommit;
  /** `origin` URL, when one is set. */
  remote?: string;
  /** Snapshots not yet pushed; undefined when nothing has been pushed yet. */
  ahead?: number;
  snapshotSeconds: number;
  auto: boolean;
  error?: string;
}

export interface HistoryDTO {
  status: HistoryStatusDTO;
  commits: HistoryCommit[];
}

export interface BacklinkDTO {
  path: string;
  title: string;
  /** `heading` is the text after `#` in the link, e.g. `L19-L22` or `page=3`. */
  mentions: { line: number; context: string; heading?: string }[];
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
