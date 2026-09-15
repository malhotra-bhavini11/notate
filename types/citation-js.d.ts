// citation-js ships without type declarations; this covers the parts notate uses.

declare module "@citation-js/core" {
  export type CslItem = Record<string, unknown> & { id?: string };

  export interface FormatOptions {
    format?: "text" | "html" | "string" | "object";
    template?: string;
    lang?: string;
  }

  export class Cite {
    constructor(data?: unknown, options?: Record<string, unknown>);
    data: CslItem[];
    format(format: "bibtex" | "biblatex" | "bibliography" | "citation" | "data", options?: FormatOptions): string;
  }

  export const plugins: {
    config: {
      get(plugin: "@bibtex"): { format: { useIdAsLabel: boolean; checkLabel: boolean; asciiOnly: boolean } };
      get(plugin: string): unknown;
    };
  };
}

declare module "@citation-js/plugin-bibtex";
declare module "@citation-js/plugin-csl";
