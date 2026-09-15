"use client";

import { FileInput, Link2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ThemedToken } from "shiki/core";

import { CopyButton } from "@/components/code-block";
import { insertIntoNote, useCanInsertIntoNote } from "@/components/note-insert";
import { useWorkspace } from "@/components/workspace-provider";
import { type FileAnchor, fileLink, formatAnchor, parseAnchor } from "@/lib/anchors";
import { CODE_THEME, languageForPath, loadHighlighter } from "@/lib/highlighter";
import { backlinksApiUrl, rawFileUrl } from "@/lib/paths";
import type { BacklinkDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

// Rendering one DOM row per line; beyond this, data files (FASTQ, big CSVs)
// would freeze the tab, so the view is truncated with a notice.
const MAX_LINES = 20_000;
// Tokenizing runs on the main thread (~60 ms per 1,000 lines), so very large
// files stay plain rather than blocking the UI.
const MAX_HIGHLIGHT_LINES = 8_000;
const MAX_HIGHLIGHT_CHARS = 1_000_000;

type State = { kind: "loading" } | { kind: "ready"; text: string } | { kind: "error"; message: string };

// Shiki's fontStyle is a bit set: 1 italic, 2 bold, 4 underline.
function tokenStyle(token: ThemedToken): React.CSSProperties {
  const style = token.fontStyle ?? 0;
  return {
    color: token.color,
    fontStyle: style & 1 ? "italic" : undefined,
    fontWeight: style & 2 ? 600 : undefined,
    textDecoration: style & 4 ? "underline" : undefined,
  };
}

interface CodeViewerProps {
  path: string;
  /** Line range from the URL (`?lines=19-22`), highlighted and scrolled into view. */
  anchor?: FileAnchor | null;
  /** URL for the current view with a different (or no) line selection. */
  anchorHref?: (anchor: FileAnchor | null) => string;
}

/**
 * Line-numbered code/text view, syntax-highlighted when the language is known.
 * Click a line number (shift-click for a range) to select lines, then copy a
 * `[[file#L19-L22]]` link or insert it into the open note. Lines that notes
 * link to are marked in the gutter.
 */
export function CodeViewer({ path, anchor, anchorHref }: CodeViewerProps) {
  const router = useRouter();
  const { index } = useWorkspace();
  const canInsert = useCanInsertIntoNote();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const [backlinks, setBacklinks] = useState<BacklinkDTO[]>([]);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Anchor we've already scrolled to, so selecting lines by clicking doesn't jump the view.
  const scrolledTo = useRef<string | null>(null);
  const language = languageForPath(path);
  const selection = anchor?.kind === "lines" ? anchor : null;

  useEffect(() => {
    let cancelled = false;
    fetch(rawFileUrl(path), { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? res.statusText);
        }
        const text = await res.text();
        if (cancelled) return;
        setState({ kind: "ready", text });

        const lineCount = text.split("\n").length;
        if (!language || lineCount > MAX_HIGHLIGHT_LINES || text.length > MAX_HIGHLIGHT_CHARS) return;
        const highlighter = await loadHighlighter();
        // Yield first so the plain text paints before tokenizing.
        await new Promise((r) => setTimeout(r, 0));
        if (cancelled || !highlighter) return;
        try {
          setTokens(highlighter.codeToTokens(text.replace(/\r\n/g, "\n"), { lang: language, theme: CODE_THEME }).tokens);
        } catch (err) {
          console.warn("[highlighter]", err);
        }
      })
      .catch((err) => !cancelled && setState({ kind: "error", message: String(err.message ?? err) }));
    return () => {
      cancelled = true;
    };
  }, [path, language]);

  // Notes linking into this file; refreshed with the workspace index (tab focus, saves elsewhere).
  useEffect(() => {
    let cancelled = false;
    fetch(backlinksApiUrl(path), { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((json: BacklinkDTO[]) => !cancelled && setBacklinks(json))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path, index]);

  const referencedLines = useMemo(() => {
    const byLine = new Map<number, string[]>();
    for (const b of backlinks) {
      for (const m of b.mentions) {
        const ref = parseAnchor(m.heading);
        if (ref?.kind !== "lines") continue;
        for (let n = ref.start; n <= Math.min(ref.end, ref.start + 500); n++) {
          byLine.set(n, [...(byLine.get(n) ?? []), `${b.title} (${formatAnchor(ref)})`]);
        }
      }
    }
    return byLine;
  }, [backlinks]);

  const anchorKey = selection ? formatAnchor(selection) : null;
  useEffect(() => {
    if (state.kind !== "ready" || !selection || scrolledTo.current === anchorKey) return;
    scrolledTo.current = anchorKey;
    rowRefs.current[selection.start - 1]?.scrollIntoView({ block: "center" });
  }, [state.kind, anchorKey, selection]);

  if (state.kind === "loading") return <p className="p-6 text-sm text-muted-foreground">Loading file…</p>;
  if (state.kind === "error") {
    return <p className="p-6 text-sm text-destructive">Couldn&apos;t open file: {state.message}</p>;
  }

  const lines = state.text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const shown = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES) : lines;
  const gutter = String(shown.length).length;

  function select(line: number, extend: boolean) {
    if (!anchorHref) return;
    let next: FileAnchor | null;
    if (extend && selection) {
      next = { kind: "lines", start: Math.min(selection.start, line), end: Math.max(selection.end, line) };
    } else if (selection && selection.start === line && selection.end === line) {
      next = null; // clicking the only selected line clears it
    } else {
      next = { kind: "lines", start: line, end: line };
    }
    scrolledTo.current = next ? formatAnchor(next) : null;
    router.replace(anchorHref(next), { scroll: false });
  }

  const selectedText = () => (selection ? lines.slice(selection.start - 1, selection.end).join("\n") : "");

  function insertSnippet() {
    if (!selection) return;
    const fence = language ?? "";
    const anchored = `${path}#${formatAnchor(selection)}`;
    insertIntoNote(
      `${fileLink(path, selection)}\n\n\`\`\`${fence} title="${anchored}" showLineNumbers{${selection.start}}\n${selectedText()}\n\`\`\`\n`,
    );
  }

  return (
    // @container: toolbar labels collapse to icons when the pane is narrow, not the window.
    <div className="@container flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <div className="flex h-9 shrink-0 items-center gap-3 overflow-x-auto border-b border-zinc-800 pr-1.5 pl-4 font-mono text-xs whitespace-nowrap text-zinc-400">
        {selection ? (
          <>
            <span className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-amber-300">
              {formatAnchor(selection).replace("-", "–")}
            </span>
            <CopyButton label="Copy link to these lines" text="Link" getText={() => fileLink(path, selection)} />
            <CopyButton label="Copy selected lines" text="Code" getText={selectedText} />
            {canInsert && (
              <>
                <ToolbarButton onClick={() => insertIntoNote(`${fileLink(path, selection)} `)} label="Insert link into note">
                  <Link2 className="size-3.5" />
                  <span className="hidden @xl:inline">Insert link</span>
                </ToolbarButton>
                <ToolbarButton onClick={insertSnippet} label="Insert link and code snippet into note">
                  <FileInput className="size-3.5" />
                  <span className="hidden @xl:inline">Insert snippet</span>
                </ToolbarButton>
              </>
            )}
            <ToolbarButton onClick={() => anchorHref && router.replace(anchorHref(null), { scroll: false })} label="Clear selection" className="ml-auto">
              <X className="size-3.5" />
            </ToolbarButton>
          </>
        ) : (
          <>
            <span>{language ?? "text"}</span>
            <span className="text-zinc-600 tabular-nums">{lines.length.toLocaleString()} lines</span>
            {language && !tokens && lines.length > MAX_HIGHLIGHT_LINES && (
              <span className="text-zinc-600">too large to highlight</span>
            )}
            {anchorHref && <span className="hidden text-zinc-600 @2xl:inline">Click a line number to link to it</span>}
            <CopyButton className="ml-auto" label="Copy file" getText={() => state.text} />
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <pre className="min-w-max py-3 font-mono text-[13px] leading-5">
          {shown.map((line, i) => {
            const n = i + 1;
            const selected = selection !== null && n >= selection.start && n <= selection.end;
            const referencedBy = referencedLines.get(n);
            return (
              <div
                key={i}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                className={cn("flex", selected ? "bg-amber-400/10" : "hover:bg-white/5")}
              >
                <span
                  className={cn(
                    "sticky left-0 flex shrink-0 items-center bg-zinc-950 pr-3 pl-2",
                    selected && "bg-[color-mix(in_oklab,var(--color-zinc-950),var(--color-amber-400)_10%)]",
                  )}
                >
                  <span
                    className={cn("mr-1.5 size-1.5 shrink-0 rounded-full", referencedBy ? "bg-emerald-400" : "bg-transparent")}
                    title={referencedBy ? `Linked from ${[...new Set(referencedBy)].join(", ")}` : undefined}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => select(n, e.shiftKey)}
                    disabled={!anchorHref}
                    aria-label={`Line ${n}`}
                    className={cn(
                      "select-none text-right tabular-nums",
                      selected ? "text-amber-300" : "text-zinc-500",
                      anchorHref && "cursor-pointer hover:text-zinc-200",
                    )}
                    style={{ minWidth: `${gutter + 1}ch` }}
                  >
                    {n}
                  </button>
                </span>
                <code className="pr-6 whitespace-pre">
                  {tokens?.[i]
                    ? tokens[i].map((token, j) => (
                        <span key={j} style={tokenStyle(token)}>
                          {token.content}
                        </span>
                      ))
                    : line || " "}
                  {tokens?.[i]?.length === 0 && " "}
                </code>
              </div>
            );
          })}
        </pre>
        {shown.length < lines.length && (
          <p className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-400">
            Showing the first {MAX_LINES.toLocaleString()} of {lines.length.toLocaleString()} lines.
          </p>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  label,
  className,
  children,
}: {
  onClick: () => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100",
        className,
      )}
    >
      {children}
    </button>
  );
}
