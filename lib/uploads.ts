import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { ASSET_FOLDER, assetFileName, extensionOf, IMAGE_TYPES, MAX_IMAGE_BYTES, sniffImage } from "./images";
import { resolveInWorkspace, WorkspaceError, writeFileAtomic } from "./workspace";

export interface UploadRequest {
  bytes: Uint8Array;
  /** File name from the drop or paste, when the browser knows one. */
  originalName?: string;
  /** Note the image is going into; its name prefixes the file. */
  notePath?: string;
  /** Folder to save in, relative to the workspace. Defaults to `assets`. */
  folder?: string;
}

export interface UploadResult {
  /** Workspace-relative path of the saved image. */
  path: string;
  bytes: number;
}

/** A name nothing else is using, by adding `-2`, `-3`, … before the extension. */
async function uniquePath(folder: string, fileName: string): Promise<{ absolute: string; relative: string }> {
  const dot = fileName.lastIndexOf(".");
  const stem = fileName.slice(0, dot);
  const ext = fileName.slice(dot);
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? fileName : `${stem}-${n}${ext}`;
    const resolved = await resolveInWorkspace([...folder.split("/").filter(Boolean), candidate]);
    if (!(await fs.stat(resolved.absolute).catch(() => null))) return resolved;
  }
  throw new WorkspaceError("Too many files with that name", 409);
}

/**
 * Saves a pasted or dropped image into the workspace. The bytes have to look
 * like the image type they claim to be, so a renamed file can't slip in.
 */
export async function saveImage({ bytes, originalName, notePath, folder = ASSET_FOLDER }: UploadRequest): Promise<UploadResult> {
  if (bytes.byteLength === 0) throw new WorkspaceError("Empty file", 400);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new WorkspaceError(`Images must be under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB`, 413);
  }

  const sniffed = sniffImage(bytes);
  if (!sniffed) throw new WorkspaceError("That file isn't an image notate can read", 415);
  // Keep the name's own extension when it agrees with the bytes (jpg vs jpeg).
  const claimed = originalName ? extensionOf(originalName) : "";
  const ext = claimed in IMAGE_TYPES && IMAGE_TYPES[claimed] === IMAGE_TYPES[sniffed] ? claimed : sniffed;

  const fileName = assetFileName({ ext, notePath, originalName });
  const { absolute, relative } = await uniquePath(folder, fileName);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await writeFileAtomic(absolute, bytes);
  return { path: relative, bytes: bytes.byteLength };
}
