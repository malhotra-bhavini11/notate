"use client";

import "katex/dist/katex.min.css";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

// Raw HTML in notes is intentionally not rendered (no rehype-raw), so a pasted
// snippet can never run script inside the app.
export function MarkdownPreview({ content }: { content: string }) {
  return (
    <article className="prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-4 prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-table:text-sm prose-th:border prose-th:bg-muted prose-th:px-2 prose-th:py-1 prose-td:border prose-td:px-2 prose-td:py-1">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
