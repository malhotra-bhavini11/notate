"use client";

import { useEffect, useState } from "react";

import { rawFileUrl } from "@/lib/paths";

// Rendering one DOM row per line; beyond this, data files (FASTQ, big CSVs)
// would freeze the tab, so the view is truncated with a notice.
const MAX_LINES = 20_000;

type State = { kind: "loading" } | { kind: "ready"; text: string } | { kind: "error"; message: string };

/** Plain text/code view with line numbers. Syntax highlighting arrives with Feature 4. */
export function CodeViewer({ path }: { path: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(rawFileUrl(path), { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? res.statusText);
        }
        const text = await res.text();
        if (!cancelled) setState({ kind: "ready", text });
      })
      .catch((err) => !cancelled && setState({ kind: "error", message: String(err.message ?? err) }));
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (state.kind === "loading") return <p className="p-6 text-sm text-muted-foreground">Loading file…</p>;
  if (state.kind === "error") {
    return <p className="p-6 text-sm text-destructive">Couldn&apos;t open file: {state.message}</p>;
  }

  const lines = state.text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const shown = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES) : lines;
  const gutter = String(shown.length).length;

  return (
    <div className="h-full overflow-auto bg-zinc-950 text-zinc-100">
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
            <code className="pr-6 whitespace-pre">{line || " "}</code>
          </div>
        ))}
      </pre>
      {shown.length < lines.length && (
        <p className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-400">
          Showing the first {MAX_LINES.toLocaleString()} of {lines.length.toLocaleString()} lines.
        </p>
      )}
    </div>
  );
}
