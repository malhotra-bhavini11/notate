"use client";

import { ExternalLink, FileType } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { rawFileUrl } from "@/lib/paths";

type ViewState =
  | { kind: "loading" }
  | { kind: "text"; text: string }
  | { kind: "pdf" }
  | { kind: "error"; message: string };

/**
 * Placeholder viewer so non-note files open from the tree. The dual-pane
 * viewer (Feature 2) replaces this with react-pdf and a highlighted code view.
 */
export function FileViewer({ path }: { path: string }) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(rawFileUrl(path), { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? res.statusText);
        }
        if (res.headers.get("content-type")?.startsWith("application/pdf")) {
          return setState({ kind: "pdf" });
        }
        const text = await res.text();
        if (!cancelled) setState({ kind: "text", text });
      })
      .catch((err) => !cancelled && setState({ kind: "error", message: String(err.message ?? err) }));
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (state.kind === "loading") return <p className="p-8 text-sm text-muted-foreground">Loading file…</p>;
  if (state.kind === "error") return <p className="p-8 text-sm text-destructive">Couldn&apos;t open file: {state.message}</p>;

  if (state.kind === "pdf") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-12 text-center">
        <FileType className="size-10 text-red-500/80" />
        <p className="text-sm text-muted-foreground">
          The in-app PDF viewer arrives with the dual-pane layout. For now you can open it in a new tab.
        </p>
        <Button
          render={<a href={rawFileUrl(path)} target="_blank" rel="noreferrer" />}
          nativeButton={false}
          variant="outline"
        >
          <ExternalLink />
          Open PDF
        </Button>
      </div>
    );
  }

  const lines = state.text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const gutter = String(lines.length).length;

  return (
    <div className="p-4">
      <div className="overflow-x-auto rounded-xl border bg-zinc-950 text-zinc-100">
        <pre className="py-3 font-mono text-[13px] leading-5">
          {lines.map((line, i) => (
            <div key={i} className="flex hover:bg-white/5">
              <span
                aria-hidden
                className="select-none pr-4 pl-4 text-right text-zinc-500"
                style={{ minWidth: `${gutter + 3}ch` }}
              >
                {i + 1}
              </span>
              <code className="pr-4 whitespace-pre">{line || " "}</code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
