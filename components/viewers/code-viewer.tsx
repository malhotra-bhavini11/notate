"use client";

import { useEffect, useState } from "react";
import type { ThemedToken } from "shiki/core";

import { CopyButton } from "@/components/code-block";
import { CODE_THEME, languageForPath, loadHighlighter } from "@/lib/highlighter";
import { rawFileUrl } from "@/lib/paths";

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

/** Line-numbered code/text view, syntax-highlighted when the language is known. */
export function CodeViewer({ path }: { path: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const language = languageForPath(path);

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

  if (state.kind === "loading") return <p className="p-6 text-sm text-muted-foreground">Loading file…</p>;
  if (state.kind === "error") {
    return <p className="p-6 text-sm text-destructive">Couldn&apos;t open file: {state.message}</p>;
  }

  const lines = state.text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const shown = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES) : lines;
  const gutter = String(shown.length).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-zinc-800 pr-1.5 pl-4 font-mono text-xs text-zinc-400">
        <span>{language ?? "text"}</span>
        <span className="text-zinc-600 tabular-nums">{lines.length.toLocaleString()} lines</span>
        {language && !tokens && lines.length > MAX_HIGHLIGHT_LINES && (
          <span className="text-zinc-600">too large to highlight</span>
        )}
        <CopyButton className="ml-auto" label="Copy file" getText={() => state.text} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <pre className="min-w-max py-3 font-mono text-[13px] leading-5">
          {shown.map((line, i) => (
            <div key={i} className="flex hover:bg-white/5">
              <span
                aria-hidden
                className="sticky left-0 shrink-0 select-none bg-zinc-950 pr-4 pl-4 text-right text-zinc-500"
                style={{ minWidth: `${gutter + 3}ch` }}
              >
                {i + 1}
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
          ))}
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
