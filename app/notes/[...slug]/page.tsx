import { NoteEditor } from "@/components/note-editor";
import { joinSlug } from "@/lib/paths";

export default async function NotePage({ params }: PageProps<"/notes/[...slug]">) {
  const path = joinSlug((await params).slug);
  // Keyed by path so switching notes resets editor state instead of reusing it.
  return <NoteEditor key={path} path={path} />;
}
