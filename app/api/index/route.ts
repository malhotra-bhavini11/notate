import { withApi } from "@/lib/http";
import { getIndexDTO } from "@/lib/link-index";

/** GET /api/index — all notes (title, type, tags), linkable files, and tag counts. */
export const GET = withApi(async () => {
  return Response.json(await getIndexDTO(), { headers: { "Cache-Control": "no-store" } });
});
