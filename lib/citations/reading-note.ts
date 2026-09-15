// Builds the paper-review note for a reference. Pure; used by the import
// dialog and the references page.

import { getTemplate, mergeFrontmatter } from "../templates";
import type { ReferenceDTO, SaveNoteBody } from "../types";

export const READING_NOTE_FOLDER = "papers";

/** `papers/love2014moderated.md`: the citekey doubles as a stable, unique file name. */
export function readingNotePath(key: string): string {
  const safe = key.replace(/[^\p{L}\p{N}_.-]+/gu, "-").replace(/^[.-]+|[.-]+$/g, "") || "reference";
  return `${READING_NOTE_FOLDER}/${safe}.md`;
}

export function buildReadingNote(ref: ReferenceDTO, date: string): SaveNoteBody {
  const template = getTemplate("paper-review");
  const frontmatter = mergeFrontmatter(template.frontmatter(ref.title, date), {
    citekey: ref.key,
    authors: ref.authors,
    year: ref.year,
    journal: ref.container,
    doi: ref.doi,
    pmid: ref.pmid,
    arxiv: ref.arxiv,
    url: ref.url,
  });

  // The template's body starts with "# Title"; the citation and abstract go right under it.
  const body = template.body(ref.title);
  const [heading, ...rest] = body.split("\n");
  const intro = [`[@${ref.key}]`, "", ...(ref.abstract ? ["## Abstract", ref.abstract, ""] : [])];
  return { frontmatter, content: [heading, "", ...intro, ...rest.slice(1)].join("\n"), createOnly: true };
}
