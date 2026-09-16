import { withApi } from "@/lib/http";
import { queryNotes } from "@/lib/link-index";
import { WorkspaceError } from "@/lib/workspace";

const MAX_QUERY_LENGTH = 2000;

/** GET /api/query?q=type:paper-review -has:dataset — notes matching a frontmatter query. */
export const GET = withApi(async (request: Request) => {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.length > MAX_QUERY_LENGTH) throw new WorkspaceError(`Query is longer than ${MAX_QUERY_LENGTH} characters`, 413);
  return Response.json(await queryNotes(q), { headers: { "Cache-Control": "no-store" } });
});
