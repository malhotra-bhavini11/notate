"use client";

import "katex/dist/katex.min.css";

import Link from "next/link";
import { createContext, useContext } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { useNoteLinks } from "@/components/use-note-links";
import { useWorkspace } from "@/components/workspace-provider";
import { remarkWikiTokens } from "@/lib/markdown-tokens";
import { tagHref } from "@/lib/paths";

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkWikiTokens];
const REHYPE_PLUGINS = [rehypeKatex];

interface MarkdownPreviewProps {
  content: string;
  /** Path of the note being rendered; ties in link resolution prefer its folder. */
  fromPath?: string;
}

// The renderer below must keep a stable identity (a new function per render
// would remount every link), so the note path reaches it through context.
const FromPathContext = createContext<string | undefined>(undefined);

const COMPONENTS: Components = {
  a({ node, children, href, ...props }) {
    const properties = node?.properties ?? {};
    if (typeof properties.dataWikilink === "string") {
      return <WikiLink target={properties.dataWikilink}>{children}</WikiLink>;
    }
    if (typeof properties.dataTag === "string") {
      return (
        <Link href={tagHref(properties.dataTag)} className="tag-link">
          {children}
        </Link>
      );
    }
    const external = href && /^https?:\/\//i.test(href);
    return (
      <a href={href} {...props} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
        {children}
      </a>
    );
  },
};

// Raw HTML in notes is intentionally not rendered (no rehype-raw), so a pasted
// snippet can never run script inside the app.
export function MarkdownPreview({ content, fromPath }: MarkdownPreviewProps) {
  return (
    <FromPathContext.Provider value={fromPath}>
      <article className="prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-4 prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-code:before:content-none prose-code:after:content-none prose-table:text-sm prose-th:border prose-th:bg-muted prose-th:px-2 prose-th:py-1 prose-td:border prose-td:px-2 prose-td:py-1">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
          {content}
        </ReactMarkdown>
      </article>
    </FromPathContext.Provider>
  );
}

function WikiLink({ target, children }: { target: string; children: React.ReactNode }) {
  const fromPath = useContext(FromPathContext);
  const { resolve, hrefFor, ready } = useNoteLinks();
  const { openNewNote } = useWorkspace();
  const resolved = ready ? resolve(target, fromPath) : null;

  if (resolved) {
    return (
      <Link href={hrefFor(resolved)} className="wikilink" title={resolved}>
        {children}
      </Link>
    );
  }

  // Unresolved: offer to create the note, Obsidian-style.
  const slash = target.lastIndexOf("/");
  return (
    <button
      type="button"
      className="wikilink wikilink-missing"
      title={ready ? `No note named “${target}”. Click to create it.` : "Loading…"}
      disabled={!ready}
      onClick={() =>
        openNewNote({
          templateId: "blank",
          title: target.slice(slash + 1),
          folder: slash === -1 ? "" : target.slice(0, slash),
          hrefAfterCreate: hrefFor,
        })
      }
    >
      {children}
    </button>
  );
}
