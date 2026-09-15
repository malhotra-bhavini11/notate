import "server-only";

import matter from "gray-matter";
import { CORE_SCHEMA, dump, load } from "js-yaml";

import type { Frontmatter } from "./types";

// gray-matter's default YAML engine turns `date: 2026-09-15` into a JS Date,
// which then round-trips back to disk as `'2026-09-15T00:00:00.000Z'`. The core
// schema keeps timestamps as plain strings so saving never rewrites user data.
const engines = {
  yaml: {
    parse: (input: string) => (load(input, { schema: CORE_SCHEMA }) ?? {}) as object,
    stringify: (data: object) => dump(data, { schema: CORE_SCHEMA, flowLevel: 1, lineWidth: -1 }),
  },
};

export function parseMarkdown(raw: string): { frontmatter: Frontmatter; content: string } {
  const parsed = matter(raw, { engines });
  const data = parsed.data;
  const frontmatter = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return { frontmatter, content: parsed.content };
}

export function stringifyMarkdown(frontmatter: Frontmatter, content: string): string {
  if (Object.keys(frontmatter).length === 0) return content;
  return matter.stringify(content, frontmatter, { engines });
}

