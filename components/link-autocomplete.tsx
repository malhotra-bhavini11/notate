"use client";

import { BookOpen } from "lucide-react";
import { useMemo, useState } from "react";

import { FileIcon } from "@/components/file-tree";
import { useWorkspace } from "@/components/workspace-provider";
import { isNotePath } from "@/lib/paths";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS = 8;
// `[[` followed by the partial target, up to the caret.
const OPEN_LINK_RE = /\[\[([^[\]\n|#]*)$/;
// `[@`, `[-@`, or `; @` inside a citation, followed by the partial key.
const OPEN_CITATION_RE = /(?:\[|;\s*)-?@([\p{L}\p{N}_:.#$%&+?<>~/-]*)$/u;

interface Suggestion {
  id: string;
  label: string;
  detail: string;
  /** What goes between the brackets (link) or after `@` (citation). */
  insert: string;
  kind: "link" | "citation";
}

interface Trigger {
  kind: "link" | "citation";
  query: string;
  /** Textarea width when triggered, to keep the popup inside it. */
  width: number;
  /** Where the replacement starts: the first `[` of `[[`, or just after `@`. */
  start: number;
  caret: number;
  top: number;
  left: number;
}

// Style properties that affect where text wraps inside a textarea.
const MIRROR_PROPS = [
  "boxSizing", "width", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontStyle", "fontVariant", "fontWeight",
  "fontSize", "lineHeight", "fontFamily", "letterSpacing", "wordSpacing", "tabSize", "textIndent",
] as const;

/** Pixel position of the caret inside a textarea, via an off-screen mirror element. */
function caretPosition(el: HTMLTextAreaElement, pos: number) {
  const style = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const prop of MIRROR_PROPS) mirror.style[prop] = style[prop];
  Object.assign(mirror.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre-wrap", overflowWrap: "break-word", top: "0", left: "-9999px" });
  mirror.textContent = el.value.slice(0, pos);
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  const result = { top: marker.offsetTop - el.scrollTop + lineHeight, left: marker.offsetLeft - el.scrollLeft };
  mirror.remove();
  return result;
}

/**
 * `[[` note-link and `[@` citation autocomplete for the note textarea. Wire
 * `onKeyDown` before the editor's own handler and call `sync` after every
 * change or caret move.
 */
export function useLinkAutocomplete(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  onInsert: (value: string, caret: number) => void,
) {
  const { index, references } = useWorkspace();
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger) return [];
    const q = trigger.query.trim().toLowerCase();
    const rankOf = (prefixFields: string[], containsFields: string[]) =>
      !q ? 1 : prefixFields.some((h) => h.startsWith(q)) ? 0 : containsFields.some((h) => h.includes(q)) ? 1 : -1;

    if (trigger.kind === "citation") {
      return (references?.entries ?? [])
        .map((e) => {
          const names = [e.key, ...e.authors.map((a) => a.split(",")[0]), String(e.year ?? "")].map((h) => h.toLowerCase());
          const suggestion: Suggestion = { id: e.key, label: `${e.inText} · @${e.key}`, detail: e.title, insert: e.key, kind: "citation" };
          return { rank: rankOf(names, [...names, e.title.toLowerCase()]), suggestion };
        })
        .filter((c) => c.rank >= 0)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, MAX_SUGGESTIONS)
        .map((c) => c.suggestion);
    }

    if (!index) return [];
    const stem = (p: string) => {
      const base = p.slice(p.lastIndexOf("/") + 1);
      return isNotePath(base) ? base.slice(0, -3) : base;
    };
    const all = [...index.notes.map((n) => ({ path: n.path, title: n.title })), ...index.files.map((path) => ({ path, title: "" }))];
    const nameCounts = new Map<string, number>();
    for (const f of all) nameCounts.set(stem(f.path).toLowerCase(), (nameCounts.get(stem(f.path).toLowerCase()) ?? 0) + 1);

    return all
      .map((f) => {
        const name = stem(f.path);
        const haystacks = [name.toLowerCase(), f.title.toLowerCase(), f.path.toLowerCase()];
        // Bare names when unique; otherwise the path keeps the link unambiguous.
        const unique = nameCounts.get(name.toLowerCase()) === 1;
        const insert = unique ? name : isNotePath(f.path) ? f.path.slice(0, -3) : f.path;
        const suggestion: Suggestion = { id: f.path, label: f.title || name, detail: f.path, insert, kind: "link" };
        return { rank: rankOf(haystacks, haystacks), notesFirst: isNotePath(f.path) ? 0 : 1, suggestion };
      })
      .filter((c) => c.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.notesFirst - b.notesFirst)
      .slice(0, MAX_SUGGESTIONS)
      .map((c) => c.suggestion);
  }, [trigger, index, references]);

  const open = trigger !== null && suggestions.length > 0;

  function sync(el: HTMLTextAreaElement) {
    const caret = el.selectionStart;
    const before = el.selectionEnd === caret ? el.value.slice(0, caret) : "";
    const link = before.match(OPEN_LINK_RE);
    const match = link ?? before.match(OPEN_CITATION_RE);
    if (!match) {
      setTrigger(null);
      return;
    }
    const kind = link ? "link" : "citation";
    const start = caret - match[1].length - (kind === "link" ? 2 : 0);
    if (start === dismissedAt) return;
    const { top, left } = caretPosition(el, caret);
    if (trigger?.start !== start) setActive(0);
    setTrigger({ kind, query: match[1], start, caret, top, left, width: el.clientWidth });
  }

  function accept(suggestion: Suggestion) {
    const el = textareaRef.current;
    if (!trigger || !el) return;
    const before = el.value.slice(0, trigger.start);
    const after = el.value.slice(trigger.caret);
    if (suggestion.kind === "link") {
      const rest = after.startsWith("]]") ? after.slice(2) : after;
      const link = `[[${suggestion.insert}]]`;
      onInsert(before + link + rest, trigger.start + link.length);
    } else {
      // Close the bracket unless this citation already has one later on the line.
      const unclosed = before.lastIndexOf("[") > before.lastIndexOf("]") && !after.split("\n")[0].includes("]");
      const text = suggestion.insert + (unclosed ? "]" : "");
      onInsert(before + text + after, trigger.start + text.length);
    }
    setTrigger(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      accept(suggestions[Math.min(active, suggestions.length - 1)]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setDismissedAt(trigger!.start);
      setTrigger(null);
      return true;
    }
    return false;
  }

  function popup() {
    if (!open) return null;
    const width = 320;
    const left = Math.max(8, Math.min(trigger!.left, trigger!.width - width - 8));
    return (
      <ul
        role="listbox"
        aria-label={trigger!.kind === "citation" ? "Citation suggestions" : "Link suggestions"}
        className="absolute z-20 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-sm shadow-lg"
        style={{ top: trigger!.top + 4, left, width }}
        // Keep focus in the textarea while clicking a suggestion.
        onMouseDown={(e) => e.preventDefault()}
      >
        {suggestions.map((s, i) => (
          <li
            key={s.id}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => accept(s)}
            className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5", i === active && "bg-muted")}
          >
            {s.kind === "citation" ? (
              <BookOpen className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileIcon ext={s.id.split(".").pop()?.toLowerCase()} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{s.label}</span>
              <span className={cn("block truncate text-xs text-muted-foreground", s.kind === "link" && "font-mono")}>
                {s.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return { sync, onKeyDown, popup, open, close: () => setTrigger(null) };
}
