"use client";

import {
  BookMarked,
  Bug,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FlaskConical,
  Info,
  Lightbulb,
  ListTodo,
  OctagonAlert,
  PencilLine,
  Quote,
  Sigma,
  Star,
  Telescope,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CALLOUT_TYPES, type CalloutColor } from "@/lib/callouts";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  theorem: Sigma,
  lemma: Sigma,
  proposition: Sigma,
  corollary: Sigma,
  conjecture: Telescope,
  definition: BookMarked,
  proof: Check,
  example: FlaskConical,
  remark: PencilLine,
  note: Info,
  tip: Lightbulb,
  important: Star,
  warning: TriangleAlert,
  caution: OctagonAlert,
  question: CircleHelp,
  todo: ListTodo,
  abstract: ClipboardList,
  quote: Quote,
  bug: Bug,
};

// Full class names, so Tailwind keeps them.
const COLORS: Record<CalloutColor, { box: string; head: string }> = {
  indigo: { box: "border-indigo-500/25 bg-indigo-500/[0.06]", head: "text-indigo-700 dark:text-indigo-300" },
  violet: { box: "border-violet-500/25 bg-violet-500/[0.06]", head: "text-violet-700 dark:text-violet-300" },
  sky: { box: "border-sky-500/25 bg-sky-500/[0.06]", head: "text-sky-700 dark:text-sky-300" },
  emerald: { box: "border-emerald-500/25 bg-emerald-500/[0.06]", head: "text-emerald-700 dark:text-emerald-300" },
  amber: { box: "border-amber-500/30 bg-amber-500/[0.08]", head: "text-amber-700 dark:text-amber-300" },
  rose: { box: "border-rose-500/25 bg-rose-500/[0.06]", head: "text-rose-700 dark:text-rose-300" },
  zinc: { box: "border-border bg-muted/40", head: "text-foreground/80" },
};

interface CalloutProps {
  type: string;
  title?: string;
  /** Sequence number for theorem-like types, counted per note. */
  number?: number;
  /** `-` collapsed, `+` open but collapsible. */
  fold?: "-" | "+" | null;
  children: React.ReactNode;
}

/** `> [!theorem] Pythagoras` — an admonition or a LaTeX-style environment. */
export function Callout({ type, title, number, fold, children }: CalloutProps) {
  const definition = CALLOUT_TYPES[type] ?? CALLOUT_TYPES.note;
  const Icon = ICONS[type] ?? Info;
  const colors = COLORS[definition.color];

  const heading = (
    <>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="font-semibold">
        {definition.label}
        {number !== undefined && ` ${number}`}
      </span>
      {title && <span className="font-normal text-foreground/80">{number !== undefined ? `(${title})` : `— ${title}`}</span>}
    </>
  );

  const body = (
    <div
      className={cn(
        "callout-body mt-1.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        definition.italic && "[&>p]:italic",
      )}
    >
      {children}
    </div>
  );

  return (
    <aside
      data-callout={type}
      className={cn("not-prose my-5 rounded-xl border px-4 py-3 text-[0.95em] leading-relaxed", colors.box, definition.qed && "callout-qed")}
    >
      {fold ? (
        <details open={fold === "+"} className="group">
          <summary className={cn("flex cursor-pointer list-none items-start gap-2 text-sm", colors.head)}>
            <ChevronRight className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
            {heading}
          </summary>
          {body}
        </details>
      ) : (
        <>
          <p className={cn("flex items-start gap-2 text-sm", colors.head)}>{heading}</p>
          {body}
        </>
      )}
    </aside>
  );
}
