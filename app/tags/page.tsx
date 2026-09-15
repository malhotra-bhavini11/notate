"use client";

import { TagList } from "@/components/tag-list";
import { useWorkspace } from "@/components/workspace-provider";

export default function TagsPage() {
  const { index } = useWorkspace();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        From frontmatter <code className="text-xs">tags:</code> and inline <code className="text-xs">#tags</code>. Nested
        tags like <code className="text-xs">#bio/rna-seq</code> also count under their parent.
      </p>
      {!index && <p className="text-sm text-muted-foreground">Loading…</p>}
      {index?.tags.length === 0 && <p className="text-sm text-muted-foreground">No tags yet.</p>}
      {index && <TagList tags={[...index.tags].sort((a, b) => a.tag.localeCompare(b.tag))} />}
    </div>
  );
}
