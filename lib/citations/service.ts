import "server-only";

import type { LookupResponse, ReferenceDTO } from "../types";
import { isPlainObject } from "../values";
import { WorkspaceError } from "../workspace";
import { generateCitekey } from "./citekey";
import { describeIdentifier, parseIdentifier } from "./identifiers";
import { addReference, findDuplicate, readLibrary, toReferenceDTO } from "./library";
import { lookupIdentifier } from "./lookup";

function identifierFromQuery(query: unknown) {
  if (typeof query !== "string" || !query.trim()) throw new WorkspaceError("Enter a DOI, PMID, PMCID, or arXiv ID", 400);
  const id = parseIdentifier(query);
  if (!id) throw new WorkspaceError("That doesn't look like a DOI, PMID, PMCID, arXiv ID, or a link to one", 400);
  return id;
}

/** Fetches metadata and proposes a citation key, flagging works already in the library. */
export async function lookupCitation(body: unknown): Promise<LookupResponse> {
  const id = identifierFromQuery(isPlainObject(body) ? body.query : undefined);
  const [item, library] = await Promise.all([lookupIdentifier(id), readLibrary()]);

  const draft = toReferenceDTO({ ...item, id: "draft" });
  const existing = findDuplicate(library.entries, draft);
  const [firstAuthor] = Array.isArray(item.author) ? (item.author as Record<string, unknown>[]) : [];
  const key =
    existing?.key ??
    generateCitekey(
      { familyName: String(firstAuthor?.family ?? firstAuthor?.literal ?? ""), year: draft.year, title: draft.title },
      library.entries.map((e) => e.key),
    );

  return {
    identifier: describeIdentifier(id),
    reference: existing ?? toReferenceDTO({ ...item, id: key }),
    ...(existing ? { existingKey: existing.key } : {}),
  };
}

/** Adds the work behind `query` to references.bib under `key`. */
export async function importCitation(body: unknown): Promise<ReferenceDTO> {
  if (!isPlainObject(body)) throw new WorkspaceError("Body must be a JSON object", 400);
  const id = identifierFromQuery(body.query);
  if (typeof body.key !== "string") throw new WorkspaceError("`key` must be a string", 400);
  // Re-fetched (from the short-lived cache) rather than trusting metadata sent by the client.
  const item = await lookupIdentifier(id);
  return addReference(item, body.key.trim());
}
