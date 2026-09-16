"use client";

import { Camera, CloudUpload, FileText, GitCommitVertical, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatWhen, post, StartTracking, useHistory } from "@/components/history";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { hrefForFile } from "@/lib/paths";
import type { HistoryStatusDTO } from "@/lib/types";

/** Every snapshot of the workspace, newest first. */
export function HistoryView() {
  const { status, commits, error, loading, reload } = useHistory();
  const { refresh } = useWorkspace();
  const [busy, setBusy] = useState<"snapshot" | "push" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pushed, setPushed] = useState<string | null>(null);

  async function run(action: "snapshot" | "push") {
    setBusy(action);
    setActionError(null);
    setPushed(null);
    try {
      const result = await post<{ output?: string }>({ action });
      if (action === "push") setPushed(result.output ?? "Pushed");
      reload();
      void refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Snapshots of your notes, kept in a git repository inside the workspace folder. Your notes are saved to disk as
        you type either way; this is for reading and restoring earlier versions.
      </p>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {status && !status.tracked && (
        <div className="rounded-xl border p-6">
          <h2 className="mb-1 font-medium">Not tracking yet</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Turning this on runs <code className="text-xs">git init</code> in your workspace folder and commits what is
            there now. Nothing leaves your machine, and it is separate from the repository the app itself lives in.
          </p>
          <StartTracking status={status} onDone={reload} />
        </div>
      )}

      {status?.tracked && (
        <>
          <StatusCard status={status} busy={busy} onSnapshot={() => run("snapshot")} onPush={() => run("push")} />
          {actionError && <p className="mt-2 text-sm text-destructive">{actionError}</p>}
          {pushed && <p className="mt-2 text-sm text-muted-foreground">{pushed}</p>}

          {commits.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No snapshots yet.
            </p>
          ) : (
            <ol className="mt-6 space-y-3">
              {commits.map((commit) => (
                <li key={commit.hash} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <GitCommitVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="font-medium">{commit.subject}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatWhen(commit.date)}</span>
                    <code className="text-xs text-muted-foreground">{commit.short}</code>
                  </div>
                  {commit.files.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-7 text-sm">
                      {commit.files.map((file) => (
                        <li key={file}>
                          <Link href={hrefForFile(file)} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline">
                            <FileText className="size-3.5" />
                            {file}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function StatusCard({
  status,
  busy,
  onSnapshot,
  onPush,
}: {
  status: HistoryStatusDTO;
  busy: "snapshot" | "push" | null;
  onSnapshot: () => void;
  onPush: () => void;
}) {
  const minutes = Math.round(status.snapshotSeconds / 60);
  // No upstream yet means nothing has been pushed, so everything is unpushed.
  const unpushed = status.ahead ?? status.commits;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
      <span>
        <strong className="tabular-nums">{status.commits}</strong> snapshot{status.commits === 1 ? "" : "s"}
      </span>
      <span className="text-muted-foreground">
        {status.pending > 0
          ? `${status.pending} file${status.pending === 1 ? "" : "s"} changed since the last one`
          : "Up to date"}
      </span>
      <span className="text-muted-foreground">
        {status.auto
          ? `Snapshots run ${minutes < 1 ? `${status.snapshotSeconds} seconds` : `${minutes} minute${minutes === 1 ? "" : "s"}`} after an edit`
          : "Automatic snapshots are off (NOTATE_HISTORY=off)"}
      </span>
      <span className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null || status.pending === 0} onClick={onSnapshot}>
          {busy === "snapshot" ? <LoaderCircle className="animate-spin" /> : <Camera />}
          Snapshot now
        </Button>
        {status.remote && (
          <Button size="sm" variant="outline" disabled={busy !== null || unpushed === 0} onClick={onPush}>
            {busy === "push" ? <LoaderCircle className="animate-spin" /> : <CloudUpload />}
            {unpushed > 0 ? `Push ${unpushed}` : "Pushed"}
          </Button>
        )}
      </span>
      {status.remote && (
        <span className="w-full truncate text-xs text-muted-foreground" title={status.remote}>
          Backing up to <code>{status.remote}</code>
          {status.ahead === undefined && " — nothing pushed yet"}
        </span>
      )}
    </div>
  );
}
