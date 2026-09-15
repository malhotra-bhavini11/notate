import Link from "next/link";

import { tagHref } from "@/lib/paths";
import { cn } from "@/lib/utils";

/** Tag chips with note counts, linking to each tag's page. */
export function TagList({ tags, className }: { tags: { tag: string; count: number }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map(({ tag, count }) => (
        <li key={tag}>
          <Link
            href={tagHref(tag)}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm hover:bg-muted"
          >
            <span>#{tag}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
