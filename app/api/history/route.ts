import { withApi } from "@/lib/http";
import { getStatus, initHistory, listCommits, push, readAtRevision, restore, snapshot } from "@/lib/history";
import { WorkspaceError } from "@/lib/workspace";

const segmentsOf = (path: string) => path.split("/").filter(Boolean);

/**
 * GET /api/history                     — status and recent snapshots
 * GET /api/history?path=note.md        — that note's snapshots
 * GET /api/history?path=note.md&rev=…  — the note as it was in that snapshot
 */
export const GET = withApi(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const path = params.get("path") ?? "";
  const rev = params.get("rev");

  if (rev) {
    if (!path) throw new WorkspaceError("`rev` needs a `path`", 400);
    return Response.json(await readAtRevision(segmentsOf(path), rev), { headers: { "Cache-Control": "no-store" } });
  }

  const [status, commits] = await Promise.all([
    getStatus(),
    listCommits(path || undefined, Number(params.get("limit")) || 50).catch(() => []),
  ]);
  return Response.json({ status, commits }, { headers: { "Cache-Control": "no-store" } });
});

/** POST /api/history — `{ action: "init" | "snapshot" | "push" | "restore", path?, rev? }`. */
export const POST = withApi(async (request: Request) => {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new WorkspaceError("Content-Type must be application/json", 415);
  }
  const body: { action?: string; path?: string; rev?: string; message?: string } = await request.json().catch(() => {
    throw new WorkspaceError("Malformed JSON body", 400);
  });

  switch (body.action) {
    case "init":
      return Response.json(await initHistory());
    case "snapshot": {
      const commit = await snapshot(body.message?.trim() || undefined);
      return Response.json({ commit, status: await getStatus() });
    }
    case "push": {
      const result = await push();
      return Response.json({ ...result, status: await getStatus() });
    }
    case "restore": {
      if (!body.path || !body.rev) throw new WorkspaceError("`restore` needs `path` and `rev`", 400);
      const restored = await restore(segmentsOf(body.path), body.rev);
      return Response.json({ ...restored, status: await getStatus() });
    }
    default:
      throw new WorkspaceError("`action` must be init, snapshot, push, or restore", 400);
  }
});
