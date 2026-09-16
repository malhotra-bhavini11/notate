import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { imageContentType, isImagePath } from "./images";
import { resolveInWorkspace, WorkspaceError } from "./workspace";

export const MAX_RAW_BYTES = 50 * 1024 * 1024;

// A NUL byte in the first chunk is the same heuristic git and grep use to call a file binary.
const SNIFF_BYTES = 8000;

export interface RawFile {
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
  filename: string;
  /** Set for files a browser could otherwise treat as a document (SVG). */
  sandbox?: boolean;
}

export async function readRawFile(segments: string[]): Promise<RawFile> {
  const { absolute, relative } = await resolveInWorkspace(segments);

  let stat;
  try {
    stat = await fs.stat(absolute);
  } catch {
    throw new WorkspaceError(`File not found: ${relative}`, 404);
  }
  if (!stat.isFile()) throw new WorkspaceError(`File not found: ${relative}`, 404);
  if (stat.size > MAX_RAW_BYTES) throw new WorkspaceError("File exceeds 50 MB", 413);

  const body = new Uint8Array(await fs.readFile(absolute));
  const filename = path.basename(absolute);

  if (path.extname(filename).toLowerCase() === ".pdf") {
    return { body, contentType: "application/pdf", filename };
  }
  if (isImagePath(relative)) {
    // An SVG opened directly is a document that could carry script, so it is
    // served under a locked-down CSP. As an <img> it can't run anything either way.
    return { body, contentType: imageContentType(relative), filename, sandbox: relative.toLowerCase().endsWith(".svg") };
  }
  if (body.subarray(0, SNIFF_BYTES).includes(0)) {
    throw new WorkspaceError(`Unsupported binary file: ${relative}`, 415);
  }
  return { body, contentType: "text/plain; charset=utf-8", filename };
}
