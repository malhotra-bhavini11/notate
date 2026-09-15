import { FileViewer } from "@/components/file-viewer";
import { joinSlug } from "@/lib/paths";

export default async function FilePage({ params }: PageProps<"/files/[...slug]">) {
  const path = joinSlug((await params).slug);
  return <FileViewer key={path} path={path} />;
}
