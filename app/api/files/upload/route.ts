import { withApi } from "@/lib/http";
import { MAX_IMAGE_BYTES } from "@/lib/images";
import { saveImage } from "@/lib/uploads";
import { WorkspaceError } from "@/lib/workspace";

/**
 * POST /api/files/upload — multipart form with `file`, and optionally `note`
 * (the note it's going into) and `folder`. Returns the workspace path to link.
 */
export const POST = withApi(async (request: Request) => {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    throw new WorkspaceError("Content-Type must be multipart/form-data", 415);
  }
  const form = await request.formData().catch(() => {
    throw new WorkspaceError("Malformed form body", 400);
  });

  const file = form.get("file");
  if (!(file instanceof File)) throw new WorkspaceError("No `file` in the form", 400);
  if (file.size > MAX_IMAGE_BYTES) {
    throw new WorkspaceError(`Images must be under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB`, 413);
  }

  const note = form.get("note");
  const folder = form.get("folder");
  const saved = await saveImage({
    bytes: new Uint8Array(await file.arrayBuffer()),
    originalName: file.name || undefined,
    notePath: typeof note === "string" && note ? note : undefined,
    folder: typeof folder === "string" && folder ? folder : undefined,
  });
  return Response.json(saved);
});
