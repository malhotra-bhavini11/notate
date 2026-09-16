"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "@/components/code-block";
import { insertIntoNote, useCanInsertIntoNote } from "@/components/note-insert";
import { imageMarkdown } from "@/lib/images";
import { rawFileUrl } from "@/lib/paths";
import { cn } from "@/lib/utils";

interface Size {
  width: number;
  height: number;
}

/** Full view of an image file, with its size and a way to put it in the open note. */
export function ImageViewer({ path }: { path: string }) {
  const [size, setSize] = useState<Size | null>(null);
  const [failed, setFailed] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  const canInsert = useCanInsertIntoNote();
  const name = path.split("/").pop() ?? path;

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <div className="flex h-9 shrink-0 items-center gap-3 overflow-x-auto border-b border-zinc-800 pr-1.5 pl-4 font-mono text-xs whitespace-nowrap text-zinc-400">
        <span className="truncate">{name}</span>
        {size && (
          <span className="shrink-0 text-zinc-600 tabular-nums">
            {size.width} × {size.height}
          </span>
        )}
        <button
          type="button"
          onClick={() => setActualSize((on) => !on)}
          aria-pressed={actualSize}
          title={actualSize ? "Fit to the pane" : "Show at actual size"}
          className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
        >
          {actualSize ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          {actualSize ? "Fit" : "Actual size"}
        </button>
        <CopyButton label="Copy Markdown for this image" text="Markdown" getText={() => imageMarkdown(path)} />
        {canInsert && (
          <button
            type="button"
            onClick={() => insertIntoNote(`${imageMarkdown(path)}\n`)}
            title="Insert this figure into the note"
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
          >
            Insert figure
          </button>
        )}
      </div>

      <div className={cn("min-h-0 flex-1 overflow-auto p-4", !actualSize && "flex items-center justify-center")}>
        {failed ? (
          <p className="text-sm text-red-400">Couldn&apos;t load this image.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a workspace file, not a static asset
          <img
            src={rawFileUrl(path)}
            alt={name}
            onLoad={(e) => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
            onError={() => setFailed(true)}
            className={cn(
              // The checks show through anything transparent, as in an image editor.
              "bg-[repeating-conic-gradient(#27272a_0%_25%,#18181b_0%_50%)] bg-[length:16px_16px]",
              actualSize ? "max-w-none" : "max-h-full max-w-full object-contain",
            )}
          />
        )}
      </div>
    </div>
  );
}
