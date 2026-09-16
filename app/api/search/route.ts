import { withApi } from "@/lib/http";
import { search } from "@/lib/search-index";
import { WorkspaceError } from "@/lib/workspace";

const MAX_QUERY_LENGTH = 500;

/** GET /api/search?q=dispersion&limit=50 — notes and files containing every term. */
export const GET = withApi(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  if (q.length > MAX_QUERY_LENGTH) throw new WorkspaceError(`Search is longer than ${MAX_QUERY_LENGTH} characters`, 413);
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);
  return Response.json({ query: q, results: await search(q, { limit }) }, { headers: { "Cache-Control": "no-store" } });
});
