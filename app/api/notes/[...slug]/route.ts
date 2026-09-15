import { withApi } from "@/lib/http";
import { parseSaveBody, readNote, writeNote } from "@/lib/notes";
import { WorkspaceError } from "@/lib/workspace";

type Ctx = RouteContext<"/api/notes/[...slug]">;

export const GET = withApi<Ctx>(async (_request, { params }) => {
  const { slug } = await params;
  return Response.json(await readNote(slug), { headers: { "Cache-Control": "no-store" } });
});

export const POST = withApi<Ctx>(async (request, { params }) => {
  const { slug } = await params;

  // Requiring JSON also forces a CORS preflight for any cross-site form/fetch.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new WorkspaceError("Content-Type must be application/json", 415);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new WorkspaceError("Malformed JSON body", 400);
  }

  return Response.json(await writeNote(slug, parseSaveBody(json)));
});
