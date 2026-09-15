"use client";

import { useMemo, useState } from "react";

import { FileIcon } from "@/components/file-tree";
import { useWorkspace } from "@/components/workspace-provider";
import { isNotePath } from "@/lib/paths";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS = 8;
// `[[` followed by the partial target, up to the caret.
const OPEN_LINK_RE = /\[\[([^[\]\n|#]*)$/;

interface Suggestion {
  path: string;
  label: string;
  /** What goes between the brackets. */
  insert: string;
}

interface Trigger {
  query: string;
  /** Textarea width when triggered, to keep the popup inside it. */
  width: number;
  /** Index of the first `[` of `[[`. */
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
 * `[[` autocomplete for the note textarea. Wire `onKeyDown` before the
 * editor's own handler and call `sync` after every change or caret move.
 */
export function useLinkAutocomplete(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  onInsert: (value: string, caret: number) => void,
) {
  const { index } = useWorkspace();
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger || !index) return [];
    const nameCounts = new Map<string, number>();
    const stem = (p: string) => {
      const base = p.slice(p.lastIndexOf("/") + 1);
      return isNotePath(base) ? base.slice(0, -3) : base;
    };
    const all = [...index.notes.map((n) => ({ path: n.path, title: n.title })), ...index.files.map((path) => ({ path, title: "" }))];
    for (const f of all) nameCounts.set(stem(f.path).toLowerCase(), (nameCounts.get(stem(f.path).toLowerCase()) ?? 0) + 1);

    const q = trigger.query.trim().toLowerCase();
    return all
      .map((f) => {
        const name = stem(f.path);
        const haystacks = [name.toLowerCase(), f.title.toLowerCase(), f.path.toLowerCase()];
        const rank = !q ? 1 : haystacks.some((h) => h.startsWith(q)) ? 0 : haystacks.some((h) => h.includes(q)) ? 1 : -1;
        // Bare names when unique; otherwise the path keeps the link unambiguous.
        const unique = nameCounts.get(name.toLowerCase()) === 1;
        const insert = unique ? name : isNotePath(f.path) ? f.path.slice(0, -3) : f.path;
        return { rank, notesFirst: isNotePath(f.path) ? 0 : 1, suggestion: { path: f.path, label: f.title || name, insert } };
      })
      .filter((c) => c.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.notesFirst - b.notesFirst)
      .slice(0, MAX_SUGGESTIONS)
      .map((c) => c.suggestion);
  }, [trigger, index]);

  const open = trigger !== null && suggestions.length > 0;

  function sync(el: HTMLTextAreaElement) {
    const caret = el.selectionStart;
    const match = el.selectionEnd === caret ? el.value.slice(0, caret).match(OPEN_LINK_RE) : null;
    if (!match) {
      setTrigger(null);
      return;
    }
    const start = caret - match[1].length - 2;
    if (start === dismissedAt) return;
    const { top, left } = caretPosition(el, caret);
    if (trigger?.start !== start) setActive(0);
    setTrigger({ query: match[1], start, caret, top, left, width: el.clientWidth });
  }

  function accept(suggestion: Suggestion) {
    const el = textareaRef.current;
    if (!trigger || !el) return;
    const after = el.value.slice(trigger.caret);
    const rest = after.startsWith("]]") ? after.slice(2) : after;
    const link = `[[${suggestion.insert}]]`;
    onInsert(el.value.slice(0, trigger.start) + link + rest, trigger.start + link.length);
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
    const width = 300;
    const left = Math.max(8, Math.min(trigger!.left, trigger!.width - width - 8));
    return (
      <ul
        role="listbox"
        aria-label="Link suggestions"
        className="absolute z-20 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-sm shadow-lg"
        style={{ top: trigger!.top + 4, left, width }}
        // Keep focus in the textarea while clicking a suggestion.
        onMouseDown={(e) => e.preventDefault()}
      >
        {suggestions.map((s, i) => (
          <li
            key={s.path}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => accept(s)}
            className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5", i === active && "bg-muted")}
          >
            <FileIcon ext={s.path.split(".").pop()?.toLowerCase()} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{s.label}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">{s.path}</span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return { sync, onKeyDown, popup, open, close: () => setTrigger(null) };
}
