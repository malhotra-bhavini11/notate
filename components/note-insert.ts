"use client";

import { useSyncExternalStore } from "react";

// Lets the left pane of split view (code/PDF viewer) insert text into the note
// open in the right pane without the two sharing a React parent. The mounted
// note editor registers itself; the viewer asks whether one is available.

type Inserter = (text: string) => void;

let inserter: Inserter | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Called by the note editor while it's open; returns an unregister function. */
export function registerNoteInserter(fn: Inserter): () => void {
  inserter = fn;
  notify();
  return () => {
    if (inserter === fn) {
      inserter = null;
      notify();
    }
  };
}

/** Inserts at the note's cursor (or the end). False if no note is open. */
export function insertIntoNote(text: string): boolean {
  if (!inserter) return false;
  inserter(text);
  return true;
}

export function useCanInsertIntoNote(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => inserter !== null,
    () => false,
  );
}
