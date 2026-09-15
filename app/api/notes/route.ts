import { withApi } from "@/lib/http";
import { listRecentNotes } from "@/lib/notes";

/** GET /api/notes?limit=20 — recently edited notes for the dashboard. */
export const GET = withApi(async (request) => {
  const limitParam = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 20;
  return Response.json(await listRecentNotes(limit), { headers: { "Cache-Control": "no-store" } });
});
