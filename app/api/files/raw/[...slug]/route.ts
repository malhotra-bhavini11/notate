import { withApi } from "@/lib/http";
import { readRawFile } from "@/lib/raw-files";

type Ctx = RouteContext<"/api/files/raw/[...slug]">;

/** Raw file for the viewer pane: UTF-8 text for code/data, a buffer for PDFs. */
export const GET = withApi<Ctx>(async (_request, { params }) => {
  const { slug } = await params;
  const file = await readRawFile(slug);

  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.body.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      // Served as text/plain even for .html/.svg, and never sniffed into something executable.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
});
