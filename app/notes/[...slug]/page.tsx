import { NoteEditor } from "@/components/note-editor";
import { joinSlug } from "@/lib/paths";

export default async function NotePage({ params, searchParams }: PageProps<"/notes/[...slug]">) {
  const path = joinSlug((await params).slug);
  // `?line=` comes from a search result: open the note with the cursor there.
  const { line } = await searchParams;
  const focusLine = Number(Array.isArray(line) ? line[0] : line);
  // Keyed by path so switching notes resets editor state instead of reusing it.
  return <NoteEditor key={path} path={path} focusLine={Number.isFinite(focusLine) && focusLine > 0 ? focusLine : undefined} />;
}
