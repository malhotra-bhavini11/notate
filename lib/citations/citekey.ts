// Citation keys in the common `author + year + first title word` style
// (`love2014moderated`), as Google Scholar and many BibTeX exports use.

/** Pandoc citekey characters; keys must start with a letter, digit, or underscore. */
export const CITEKEY_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_:.#$%&+?<>~/-]*$/u;

const STOP_WORDS = new Set([
  "a", "an", "the", "on", "of", "in", "for", "and", "to", "with", "from", "by", "at", "as", "is", "are",
  "via", "using", "towards", "toward", "into", "its", "new",
]);

const ascii = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toLowerCase();

export interface CitekeyParts {
  familyName?: string;
  year?: number | string;
  title?: string;
}

export function generateCitekey({ familyName, year, title }: CitekeyParts, taken: Iterable<string> = []): string {
  const author = ascii(familyName ?? "") || "anon";
  const word =
    (title ?? "")
      .split(/[\s\-–—:/]+/)
      .map(ascii)
      .find((w) => w.length > 1 && !STOP_WORDS.has(w)) ?? "";
  const base = `${author}${year ?? ""}${word}` || "ref";

  const used = new Set([...taken].map((k) => k.toLowerCase()));
  if (!used.has(base)) return base;
  // love2014moderated, love2014moderateda, love2014moderatedb, …
  for (let i = 0; i < 26 * 26; i++) {
    const suffix = i < 26 ? String.fromCharCode(97 + i) : `${String.fromCharCode(97 + Math.floor(i / 26) - 1)}${String.fromCharCode(97 + (i % 26))}`;
    if (!used.has(base + suffix)) return base + suffix;
  }
  return `${base}${Date.now()}`;
}
