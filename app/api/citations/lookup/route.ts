import { lookupCitation } from "@/lib/citations/service";
import { withApi } from "@/lib/http";
import { WorkspaceError } from "@/lib/workspace";

/** POST /api/citations/lookup { query } — metadata for a DOI, PMID, PMCID, or arXiv ID. */
export const POST = withApi(async (request) => {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new WorkspaceError("Content-Type must be application/json", 415);
  }
  const body = await request.json().catch(() => {
    throw new WorkspaceError("Malformed JSON body", 400);
  });
  return Response.json(await lookupCitation(body));
});
