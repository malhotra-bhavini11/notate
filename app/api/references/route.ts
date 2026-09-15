import { getReferencesDTO } from "@/lib/citations/library";
import { importCitation } from "@/lib/citations/service";
import { withApi } from "@/lib/http";
import { WorkspaceError } from "@/lib/workspace";

/** GET /api/references — entries in references.bib with APA text and BibTeX. */
export const GET = withApi(async () => {
  return Response.json(await getReferencesDTO(), { headers: { "Cache-Control": "no-store" } });
});

/** POST /api/references { query, key } — look up an identifier and append it to references.bib. */
export const POST = withApi(async (request) => {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new WorkspaceError("Content-Type must be application/json", 415);
  }
  const body = await request.json().catch(() => {
    throw new WorkspaceError("Malformed JSON body", 400);
  });
  return Response.json({ reference: await importCitation(body) });
});
