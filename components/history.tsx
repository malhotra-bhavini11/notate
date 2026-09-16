"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { diffLines, type DiffRow } from "@/lib/diff";
import { historyApiUrl, rawFileUrl } from "@/lib/paths";
import type { HistoryCommit, HistoryDTO, HistoryStatusDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

async function historyFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json as T;
}

export const post = <T,>(body: Record<string, unknown>) =>
  historyFetch<T>("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

interface HistoryState {
  status: HistoryStatusDTO | null;
  commits: HistoryCommit[];
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Snapshots for the whole workspace, or for one note when `path` is given. */
export function useHistory(path?: string): HistoryState {
  const [data, setData] = useState<HistoryDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    historyFetch<HistoryDTO>(historyApiUrl(path))
      .then((json) => !cancelled && (setData(json), setError(null)))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const reload = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);
  return { status: data?.status ?? null, commits: data?.commits ?? [], error, loading, reload };
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Turn history on, shown wherever the workspace isn't tracked yet. */
export function StartTracking({ status, onDone }: { status: HistoryStatusDTO; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status.git) {
    return (
      <p className="text-sm text-muted-foreground">
        History needs git, which isn&apos;t installed or isn&apos;t on PATH. Install it from{" "}
        <a href="https://git-scm.com/downloads" target="_blank" rel="noreferrer noopener" className="underline">
          git-scm.com
        </a>
        , then reload.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await post({ action: "init" });
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <LoaderCircle className="animate-spin" />}
        Start tracking history
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** One note's snapshots, with a diff against the saved file and a restore button. */
export function NoteHistory({ path, onRestored }: { path: string; onRestored: () => void }) {
  const { status, commits, error, loading, reload } = useHistory(path);
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState<{ rev: string; content: string } | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const rev = selected ?? commits[0]?.hash ?? null;

  // The file as saved on disk, frontmatter included, so it compares like for
  // like with a snapshot. Autosave means this is the note as of a second ago.
  useEffect(() => {
    let cancelled = false;
    fetch(rawFileUrl(path), { cache: "no-store" })
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => !cancelled && setCurrent(text))
      .catch(() => !cancelled && setCurrent(""));
    return () => {
      cancelled = true;
    };
  }, [path, commits]);

  useEffect(() => {
    if (!rev) return;
    let cancelled = false;
    historyFetch<{ content: string }>(historyApiUrl(path, rev))
      .then((json) => !cancelled && setVersion({ rev, content: json.content }))
      .catch((err) => !cancelled && setActionError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [path, rev]);

  const diff = useMemo(
    () => (version?.rev === rev && current !== null ? diffLines(version.content, current) : null),
    [version, rev, current],
  );

  if (loading) return <PanelMessage>Loading history…</PanelMessage>;
  if (error) return <PanelMessage tone="error">{error}</PanelMessage>;
  if (status && !status.tracked) {
    return (
      <div className="rounded-xl border p-6">
        <p className="mb-3 text-sm text-muted-foreground">
          History isn&apos;t turned on yet. Tracking takes a snapshot of your notes every few minutes so you can read
          and restore earlier versions.
        </p>
        <StartTracking status={status} onDone={reload} />
      </div>
    );
  }
  if (commits.length === 0) return <PanelMessage>No snapshots of this note yet.</PanelMessage>;

  async function restoreSelected() {
    if (!rev) return;
    setBusy(true);
    setActionError(null);
    try {
      await post({ action: "restore", path, rev });
      onRestored();
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const selectedCommit = commits.find((c) => c.hash === rev);

  return (
    <div className="grid min-h-[60vh] gap-4 rounded-xl border p-4 md:grid-cols-[14rem_minmax(0,1fr)]">
      <ol className="max-h-[60vh] space-y-1 overflow-y-auto">
        {commits.map((commit) => (
          <li key={commit.hash}>
            <button
              type="button"
              onClick={() => setSelected(commit.hash)}
              className={cn(
                "w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                commit.hash === rev && "bg-muted",
              )}
            >
              <span className="block truncate">{commit.subject}</span>
              <span className="block text-xs text-muted-foreground">{formatWhen(commit.date)}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {selectedCommit ? `${formatWhen(selectedCommit.date)} · ${selectedCommit.short}` : "Select a snapshot"}
          </span>
          {diff && (
            <span className="text-xs text-muted-foreground tabular-nums">
              <span className="text-emerald-700 dark:text-emerald-400">+{diff.added}</span>{" "}
              <span className="text-rose-700 dark:text-rose-400">−{diff.removed}</span> vs now
            </span>
          )}
          <Button size="xs" variant="outline" className="ml-auto" disabled={busy || !diff || diff.rows.length === 0} onClick={restoreSelected}>
            {busy ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
            Restore this version
          </Button>
        </div>
        {actionError && <p className="mb-2 text-sm text-destructive">{actionError}</p>}
        {diff ? <DiffView diff={diff} /> : <PanelMessage>Loading that version…</PanelMessage>}
      </div>
    </div>
  );
}

function PanelMessage({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <p className={cn("rounded-xl border border-dashed p-6 text-center text-sm", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
      {children}
    </p>
  );
}

const ROW_STYLES: Record<DiffRow["kind"], string> = {
  add: "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  remove: "bg-rose-500/10 text-rose-900 dark:text-rose-200",
  context: "",
  gap: "bg-muted/50 text-muted-foreground",
};

const SIGNS: Record<DiffRow["kind"], string> = { add: "+", remove: "−", context: " ", gap: "" };

/** Snapshot on the left, the file as it is now on the right. */
export function DiffView({ diff }: { diff: ReturnType<typeof diffLines> }) {
  if (diff.rows.length === 0) {
    return <PanelMessage>This snapshot matches the note as it is now.</PanelMessage>;
  }
  return (
    <div className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/20 font-mono text-xs leading-5">
      {diff.truncated && (
        <p className="border-b px-3 py-1.5 text-muted-foreground">Too long to compare line by line; showing both versions.</p>
      )}
      {diff.rows.map((row, i) => (
        <div key={i} className={cn("flex gap-3 px-3", ROW_STYLES[row.kind])}>
          <span className="w-10 shrink-0 text-right text-muted-foreground/70 tabular-nums select-none">
            {row.kind === "gap" ? "" : (row.oldLine ?? "")}
          </span>
          <span className="w-10 shrink-0 text-right text-muted-foreground/70 tabular-nums select-none">
            {row.kind === "gap" ? "" : (row.newLine ?? "")}
          </span>
          <span className="shrink-0 select-none">{SIGNS[row.kind]}</span>
          <span className="break-all whitespace-pre-wrap">
            {row.kind === "gap" ? `⋯ ${row.count} unchanged ${row.count === 1 ? "line" : "lines"}` : row.text || " "}
          </span>
        </div>
      ))}
    </div>
  );
}
