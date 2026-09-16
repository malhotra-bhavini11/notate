// Figures: which files count as images, what they're called on disk, and how a
// note refers to them. Pure, so the editor and the API agree.

export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

/** Where pasted and dropped images are saved, relative to the workspace. */
export const ASSET_FOLDER = "assets";

/** Bigger than this and it belongs beside the notes as a file, not inside one. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const extensionOf = (p: string) => p.slice(p.lastIndexOf(".") + 1).toLowerCase();

export const isImagePath = (p: string) => p.includes(".") && extensionOf(p) in IMAGE_TYPES;

export const imageContentType = (p: string) => IMAGE_TYPES[extensionOf(p)];

// Magic numbers, so a renamed executable can't be passed off as a .png.
const SIGNATURES: [string, number[]][] = [
  ["png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ["jpg", [0xff, 0xd8, 0xff]],
  ["gif", [0x47, 0x49, 0x46, 0x38]],
  ["bmp", [0x42, 0x4d]],
];

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/** The extension the bytes actually are, or null if they aren't an image. */
export function sniffImage(bytes: Uint8Array): string | null {
  for (const [ext, signature] of SIGNATURES) if (startsWith(bytes, signature)) return ext;
  // RIFF....WEBP and the ISO-BMFF box used by AVIF.
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (ascii(bytes, 4, 4) === "ftyp" && ["avif", "avis"].includes(ascii(bytes, 8, 4))) return "avif";
  const head = ascii(bytes, 0, 300).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return null;
}

const slug = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const stamp = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");

/**
 * `assets/deseq2-dispersion-plot.png` for a dropped file, or
 * `assets/deseq2-20260916-143012.png` for something pasted, which has no name.
 */
export function assetFileName(options: { ext: string; notePath?: string; originalName?: string; now?: Date }): string {
  const { ext, notePath, originalName, now = new Date() } = options;
  const note = notePath ? slug(notePath.split("/").pop()!.replace(/\.md$/i, "")) : "";
  const original = originalName ? slug(originalName.replace(/\.[^.]+$/, "")) : "";
  // Clipboard images arrive as "image.png"; a timestamp tells them apart.
  const base = original && original !== "image" ? original : stamp(now);
  return [note, base].filter(Boolean).join("-") + `.${ext}`;
}

/** Markdown for a figure: `![alt](path "caption")`, with the caption optional. */
export function imageMarkdown(path: string, alt = "", caption?: string): string {
  const target = path.includes(" ") ? `<${path}>` : path;
  return `![${alt}](${target}${caption ? ` "${caption.replace(/"/g, "'")}"` : ""})`;
}
