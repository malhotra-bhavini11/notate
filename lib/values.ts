// Dependency-free helpers for frontmatter values, safe to import from client components.

import type { Frontmatter } from "./types";

export function isPlainObject(value: unknown): value is Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts `[a, b]`, `"a, b"`, or `"#a #b"` and returns `["a", "b"]`. */
export function toTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, ""))
      .filter(Boolean);
  }
  return [];
}
