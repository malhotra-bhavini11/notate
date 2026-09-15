"use client";

import "katex/dist/katex.min.css";

import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import Link from "next/link";
import { createContext, Fragment, Suspense, use, useContext, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { PluggableList } from "unified";

import { CodeBlock } from "@/components/code-block";
import { useNoteLinks } from "@/components/use-note-links";
import { useWorkspace } from "@/components/workspace-provider";
import { ACCESSION_TYPE_BY_KEY } from "@/lib/accessions";
import { CODE_THEME, CODE_TRANSFORMERS, loadHighlighter, rehypeCodeFence } from "@/lib/highlighter";
import { extractLinksAndTags, parseCitation, remarkWikiTokens } from "@/lib/markdown-tokens";
import { noteHref, referencesHref, tagHref } from "@/lib/paths";
import type { ReferenceDTO } from "@/lib/types";

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkWikiTokens];
// KaTeX first: display math also arrives as <pre><code class="language-math">,
// and the highlighter must not turn equations into code blocks.
const BASE_REHYPE_PLUGINS: PluggableList = [rehypeKatex, rehypeCodeFence];

interface MarkdownPreviewProps {
  content: string;
  /** Path of the note being rendered; ties in link resolution prefer its folder. */
  fromPath?: string;
}

// The renderers below must keep a stable identity (a new function per render
// would remount every link), so the note path reaches them through context.
const FromPathContext = createContext<string | undefined>(undefined);

const COMPONENTS: Components = {
  a({ node, children, href, ...props }) {
    const properties = node?.properties ?? {};
    if (typeof properties.dataWikilink === "string") {
      return <WikiLink target={properties.dataWikilink}>{children}</WikiLink>;
    }
    if (typeof properties.dataAccession === "string") {
      const type = ACCESSION_TYPE_BY_KEY.get(properties.dataAccession);
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="accession-link"
          title={type ? `${type.name} · ${type.description}` : undefined}
        >
          {children}
        </a>
      );
    }
    if (typeof properties.dataCitation === "string") {
      return <Citation inner={properties.dataCitation}>{children}</Citation>;
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
  pre({ node, children, ...props }) {
    const properties = node?.properties ?? {};
    return (
      <CodeBlock
        {...props}
        language={typeof properties.dataLanguage === "string" ? properties.dataLanguage : undefined}
        title={typeof properties.dataTitle === "string" ? properties.dataTitle : undefined}
        lineNumbers={properties.dataLineNumbers !== undefined}
      >
        {children}
      </CodeBlock>
    );
  },
};

const PROSE =
  "prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-4 prose-code:before:content-none prose-code:after:content-none prose-table:text-sm prose-th:border prose-th:bg-muted prose-th:px-2 prose-th:py-1 prose-td:border prose-td:px-2 prose-td:py-1";

// Raw HTML in notes is intentionally not rendered (no rehype-raw), so a pasted
// snippet can never run script inside the app.
export function MarkdownPreview({ content, fromPath }: MarkdownPreviewProps) {
  return (
    <FromPathContext.Provider value={fromPath}>
      <article className={PROSE}>
        {/* Renders immediately without colours, then re-renders once grammars load. */}
        <Suspense fallback={<MarkdownBody content={content} rehypePlugins={BASE_REHYPE_PLUGINS} />}>
          <HighlightedMarkdownBody content={content} />
        </Suspense>
        <CitedReferences content={content} />
      </article>
    </FromPathContext.Provider>
  );
}

function HighlightedMarkdownBody({ content }: { content: string }) {
  const highlighter = use(loadHighlighter());
  const plugins = useMemo<PluggableList>(
    () =>
      highlighter
        ? [
            ...BASE_REHYPE_PLUGINS,
            [
              rehypeShikiFromHighlighter,
              highlighter,
              {
                theme: CODE_THEME,
                transformers: CODE_TRANSFORMERS,
                // Unfenced blocks and unknown languages still get the code-block treatment.
                defaultLanguage: "text",
                fallbackLanguage: "text",
                onError: (err: unknown) => console.warn("[highlighter]", err),
              },
            ],
          ]
        : BASE_REHYPE_PLUGINS,
    [highlighter],
  );
  return <MarkdownBody content={content} rehypePlugins={plugins} />;
}

function MarkdownBody({ content, rehypePlugins }: { content: string; rehypePlugins: PluggableList }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={rehypePlugins} components={COMPONENTS}>
      {content}
    </ReactMarkdown>
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

function useReferenceLookup() {
  const { references, index } = useWorkspace();
  return useMemo(() => {
    const byKey = new Map((references?.entries ?? []).map((e) => [e.key.toLowerCase(), e]));
    const notesByKey = new Map((index?.notes ?? []).filter((n) => n.citekey).map((n) => [n.citekey!.toLowerCase(), n.path]));
    return {
      ready: references !== null,
      find: (key: string) => byKey.get(key.toLowerCase()),
      noteFor: (key: string) => notesByKey.get(key.toLowerCase()),
    };
  }, [references, index]);
}

/** `[see @love2014moderated, p. 3; -@vaswani2017attention]` → (see Love et al., 2014, p. 3; 2017) */
function Citation({ inner, children }: { inner: string; children: React.ReactNode }) {
  const { ready, find, noteFor } = useReferenceLookup();
  const items = parseCitation(inner);
  if (!items || !ready) return <span className="citation">{children}</span>;

  return (
    <span className="citation">
      (
      {items.map((item, i) => {
        const entry = find(item.key);
        const note = noteFor(item.key);
        const label = entry ? (item.suppressAuthor ? String(entry.year ?? "n.d.") : entry.inText) : `@${item.key}`;
        const text = [item.prefix, label].filter(Boolean).join(" ") + (item.locator ? `, ${item.locator}` : "");
        return (
          <Fragment key={i}>
            {i > 0 && "; "}
            {entry ? (
              <Link href={note ? noteHref(note) : referencesHref(entry.key)} className="citation-item" title={entry.formatted}>
                {text}
              </Link>
            ) : (
              <Link href={referencesHref()} className="citation-item citation-missing" title={`@${item.key} isn't in references.bib`}>
                {text}?
              </Link>
            )}
          </Fragment>
        );
      })}
      )
    </span>
  );
}

/** Bibliography for the keys cited in this note, APA-sorted, like Pandoc's references section. */
function CitedReferences({ content }: { content: string }) {
  const { ready, find } = useReferenceLookup();
  const keys = useMemo(() => extractLinksAndTags(content).citations, [content]);
  if (!ready || keys.length === 0) return null;

  const found = keys.map(find).filter((e): e is ReferenceDTO => e !== undefined);
  const missing = keys.filter((k) => !find(k));
  const sorted = [...new Map(found.map((e) => [e.key, e])).values()].sort((a, b) => a.formatted.localeCompare(b.formatted));

  return (
    <section aria-labelledby="cited-references" className="mt-10 border-t pt-4">
      <h2 id="cited-references" className="mt-0!">References</h2>
      <ul className="list-none pl-0">
        {sorted.map((e) => (
          <li key={e.key} className="pl-6 -indent-6 text-sm">
            {e.formatted}
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <p className="text-sm text-destructive">
          Not in references.bib: {missing.map((k) => `@${k}`).join(", ")}.{" "}
          <Link href={referencesHref()}>Import them</Link>.
        </p>
      )}
    </section>
  );
}
