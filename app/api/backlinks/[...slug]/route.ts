import { withApi } from "@/lib/http";
import { getBacklinks } from "@/lib/link-index";

type Ctx = RouteContext<"/api/backlinks/[...slug]">;

/** GET /api/backlinks/papers/a.md — notes linking here, with the lines that mention it. */
export const GET = withApi<Ctx>(async (_request, { params }) => {
  const { slug } = await params;
  return Response.json(await getBacklinks(slug), { headers: { "Cache-Control": "no-store" } });
});
