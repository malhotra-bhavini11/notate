"use client";

import { useEffect, useId, useState } from "react";

import { CopyButton } from "@/components/code-block";
import { cn } from "@/lib/utils";

type State = { kind: "loading" } | { kind: "ready"; svg: string } | { kind: "error"; message: string };

let mermaidPromise: Promise<typeof import("mermaid").default | null> | null = null;

/** Loaded once, on first diagram: the library is large, so it stays out of the main bundle. */
function loadMermaid() {
  mermaidPromise ??= import("mermaid")
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        // Sanitises the SVG it produces; note text is never trusted markup.
        securityLevel: "strict",
        theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
        fontFamily: "var(--font-sans), ui-sans-serif, system-ui",
        flowchart: { curve: "basis", useMaxWidth: true },
      });
      return mermaid;
    })
    .catch((err) => {
      console.error("[mermaid] failed to load", err);
      return null;
    });
  return mermaidPromise;
}

/** ```mermaid fences: pipeline DAGs, sequence diagrams, state machines, Gantt charts. */
export function MermaidDiagram({ code, title }: { code: string; title?: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Mermaid uses this as a DOM id, so keep it to safe characters.
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then(async (mermaid) => {
        if (!mermaid) throw new Error("diagram library failed to load");
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) setState({ kind: "ready", svg });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: String(err?.message ?? err).split("\n")[0] });
        // A failed render leaves its scratch element behind.
        document.getElementById(`d${id}`)?.remove();
      });
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  return (
    <figure className="not-prose group my-5 overflow-hidden rounded-xl border">
      <div className="flex h-9 items-center justify-between gap-2 border-b bg-muted/40 pr-1.5 pl-3 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">{title ?? "Diagram"}</span>
        <CopyButton
          className="h-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-muted hover:text-foreground"
          label="Copy diagram source"
          getText={() => code}
        />
      </div>
      {state.kind === "error" ? (
        <div className="px-3 py-2">
          <p className="text-sm text-destructive">Couldn&apos;t draw this diagram: {state.message}</p>
          <pre className="mt-2 overflow-x-auto font-mono text-xs text-muted-foreground">{code}</pre>
        </div>
      ) : (
        <div
          // A block (not flex) container: the SVG asks for width:100%, which a flex item would shrink away.
          className={cn("mermaid-diagram overflow-x-auto p-4 text-center", state.kind === "loading" && "text-sm text-muted-foreground")}
          // Mermaid renders and sanitises this SVG itself (securityLevel: strict).
          dangerouslySetInnerHTML={state.kind === "ready" ? { __html: state.svg } : undefined}
        >
          {state.kind === "loading" ? "Drawing diagram…" : undefined}
        </div>
      )}
    </figure>
  );
}
