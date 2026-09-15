import { TagView } from "@/components/tag-view";
import { joinSlug } from "@/lib/paths";

export default async function TagPage({ params }: PageProps<"/tags/[...tag]">) {
  const tag = joinSlug((await params).tag).toLowerCase();
  return <TagView tag={tag} />;
}
