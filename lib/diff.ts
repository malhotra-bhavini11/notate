// Line diff for the note history panel. Pure, so it runs on either side.

export type DiffRowKind = "context" | "add" | "remove" | "gap";

export interface DiffRow {
  kind: DiffRowKind;
  text: string;
  /** 1-based line numbers; absent on the side where the line doesn't exist. */
  oldLine?: number;
  newLine?: number;
  /** Unchanged lines hidden by a "gap" row. */
  count?: number;
}

export interface Diff {
  rows: DiffRow[];
  added: number;
  removed: number;
  /** Set when the files were too big to compare line by line. */
  truncated: boolean;
}

// The table below is O(n·m); past this, a note is compared as two blocks.
const MAX_LINES = 2000;

const split = (text: string) => {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
};

/** Longest common subsequence of lines, as a table to walk back through. */
function lcs(a: string[], b: string[]): Int32Array {
  const width = b.length + 1;
  const table = new Int32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  return table;
}

/** Unified-style rows, with unchanged runs longer than `context` collapsed. */
export function diffLines(before: string, after: string, context = 3): Diff {
  const a = split(before);
  const b = split(after);
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return {
      rows: [
        ...a.map((text, i) => ({ kind: "remove" as const, text, oldLine: i + 1 })),
        ...b.map((text, i) => ({ kind: "add" as const, text, newLine: i + 1 })),
      ],
      added: b.length,
      removed: a.length,
      truncated: true,
    };
  }

  const table = lcs(a, b);
  const width = b.length + 1;
  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ kind: "context", text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      rows.push({ kind: "remove", text: a[i], oldLine: i + 1 });
      removed++;
      i++;
    } else {
      rows.push({ kind: "add", text: b[j], newLine: j + 1 });
      added++;
      j++;
    }
  }
  for (; i < a.length; i++, removed++) rows.push({ kind: "remove", text: a[i], oldLine: i + 1 });
  for (; j < b.length; j++, added++) rows.push({ kind: "add", text: b[j], newLine: j + 1 });

  // Identical files produce no rows at all, so callers can treat that as "no change".
  return { rows: added || removed ? collapse(rows, context) : [], added, removed, truncated: false };
}

/** Replaces long unchanged runs with a single gap row. */
function collapse(rows: DiffRow[], context: number): DiffRow[] {
  const changed = rows.map((r) => r.kind !== "context");
  const keep = rows.map((_, i) =>
    changed.slice(Math.max(0, i - context), i + context + 1).some(Boolean),
  );
  const out: DiffRow[] = [];
  let hidden = 0;
  rows.forEach((row, i) => {
    if (keep[i]) {
      if (hidden) {
        out.push({ kind: "gap", text: "", count: hidden });
        hidden = 0;
      }
      out.push(row);
    } else {
      hidden++;
    }
  });
  if (hidden) out.push({ kind: "gap", text: "", count: hidden });
  return out;
}
