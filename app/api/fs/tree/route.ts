import { withApi } from "@/lib/http";
import { buildTree } from "@/lib/tree";
import { ensureWorkspace } from "@/lib/workspace";

export const GET = withApi(async () => {
  const root = await ensureWorkspace();
  return Response.json(await buildTree(root), { headers: { "Cache-Control": "no-store" } });
});
