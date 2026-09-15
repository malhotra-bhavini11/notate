"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Missing API or permission denied (some embedded browsers): try the legacy path.
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Copy failed");
}

export function CopyButton({ getText, className, label = "Copy code" }: { getText: () => string; className?: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await writeClipboard(getText());
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={state === "failed" ? "Couldn't copy" : label}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-400",
        className,
      )}
    >
      {state === "copied" ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Failed" : "Copy"}</span>
    </button>
  );
}

interface CodeBlockProps extends React.ComponentProps<"pre"> {
  language?: string;
  title?: string;
  lineNumbers?: boolean;
}

/**
 * The code as it should be pasted: lines marked `[!code --]` are left out, and
 * lines that carried a notation comment lose the whitespace it leaves behind.
 */
function codeForCopy(pre: HTMLPreElement | null): string {
  if (!pre) return "";
  const lines = pre.querySelectorAll<HTMLElement>(".line");
  if (lines.length === 0) return pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
  return Array.from(lines)
    .filter((line) => !line.classList.contains("remove"))
    .map((line) => {
      const text = line.textContent ?? "";
      const annotated = line.classList.contains("diff") || line.classList.contains("highlighted");
      return annotated ? text.trimEnd() : text;
    })
    .join("\n");
}

/** Dark code block with a header showing the title or language and a copy button. */
export function CodeBlock({ children, className, language, title, lineNumbers, ...props }: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null);

  return (
    <div className="code-block not-prose group relative my-5 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-zinc-800 pr-1.5 pl-4">
        <span className="min-w-0 truncate font-mono text-xs text-zinc-400">
          {title ?? language ?? "text"}
          {title && language && <span className="ml-2 text-zinc-600">{language}</span>}
        </span>
        <CopyButton getText={() => codeForCopy(preRef.current)} />
      </div>
      <pre ref={preRef} {...props} data-line-numbers={lineNumbers ? "" : undefined} className={cn("overflow-x-auto py-3 font-mono text-[13px] leading-6 text-zinc-100", className)}>
        {children}
      </pre>
    </div>
  );
}
