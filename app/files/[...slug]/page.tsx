import { FileViewer } from "@/components/file-viewer";
import { anchorFromParams } from "@/lib/anchors";
import { joinSlug } from "@/lib/paths";

/** `/files/<path>`, optionally `?lines=19-22` (code) or `?page=3` (PDF). */
export default async function FilePage({ params, searchParams }: PageProps<"/files/[...slug]">) {
  const path = joinSlug((await params).slug);
  const query = await searchParams;
  const anchor = anchorFromParams({ get: (name) => (typeof query[name] === "string" ? (query[name] as string) : null) });
  return <FileViewer key={path} path={path} anchor={anchor} />;
}
