import type { Element, Root as HastRoot } from "hast";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import {
  cellText,
  countFields,
  parseQuery,
  type QueryableNote,
  rehypeQueryBlocks,
  resultToCsv,
  runQuery,
  withSort,
} from "@/lib/query";

const day = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

const note = (path: string, frontmatter: Record<string, unknown>, extra: Partial<QueryableNote> = {}): QueryableNote => ({
  path,
  title: typeof frontmatter.title === "string" ? frontmatter.title : path.split("/").pop()!.replace(/\.md$/, ""),
  frontmatter,
  tags: [],
  citations: [],
  accessions: [],
  links: [],
  mtime: day("2026-09-01"),
  ...extra,
});

const NOTES: QueryableNote[] = [
  note(
    "papers/deseq2.md",
    { title: "DESeq2", type: "paper-review", year: 2014, doi: "10.1186/s13059-014-0550-8", authors: ["Love", "Huber"], journal: "Genome Biology" },
    { tags: ["rna-seq", "stats/bayes"], citations: ["love2014moderated"], mtime: day("2026-09-10") },
  ),
  note(
    "papers/scvi.md",
    { title: "scVI", type: "paper-review", year: "2018", dataset: "GSE102827", tags: ["scRNA-seq"] },
    { tags: ["scrna-seq"], accessions: ["geo:GSE102827"], mtime: day("2026-08-20") },
  ),
  note(
    "papers/attention.md",
    { title: "Attention is all you need", type: "Paper-Review", year: 2017, dataset: "", meta: { venue: "NeurIPS" } },
    { mtime: day("2026-09-14") },
  ),
  note(
    "code-reviews/pipeline.md",
    { title: "Pipeline review", type: "code-review", status: "running" },
    { links: ["pipelines/qc.py", "papers/deseq2.md"], accessions: ["geo:GSE60450", "ensembl:ENSG00000141510"], mtime: day("2026-07-01") },
  ),
  note("welcome.md", { type: "guide" }, { mtime: day("2026-09-15") }),
];

const paths = (q: string, notes = NOTES) => runQuery(parseQuery(q), notes).rows.map((r) => r.path);

describe("parseQuery", () => {
  it("parses fields, negation, operators and directives", () => {
    const parsed = parseQuery('type:paper-review,preprint -has:dataset year:>=2020 title:~deseq journal:"Genome Biology" sort:-year limit:5');
    expect(parsed.terms).toEqual([
      { kind: "field", field: "type", op: "eq", values: ["paper-review", "preprint"], negate: false },
      { kind: "has", field: "dataset", negate: true },
      { kind: "field", field: "year", op: "gte", values: ["2020"], negate: false },
      { kind: "field", field: "title", op: "contains", values: ["deseq"], negate: false },
      { kind: "field", field: "journal", op: "eq", values: ["Genome Biology"], negate: false },
    ]);
    expect(parsed.sort).toEqual([{ field: "year", desc: true }]);
    expect(parsed.limit).toBe(5);
    expect(parsed.errors).toEqual([]);
  });

  it("parses ranges, tags, folders, aliases and bare words", () => {
    expect(parseQuery("year:2019..2023").terms[0]).toMatchObject({ op: "range", values: ["2019", "2023"] });
    expect(parseQuery("year:2019..").terms[0]).toMatchObject({ op: "gte", values: ["2019"] });
    expect(parseQuery("#bio").terms[0]).toMatchObject({ field: "tags", values: ["bio"] });
    expect(parseQuery("tag:bio").terms[0]).toMatchObject({ field: "tags" });
    expect(parseQuery("in:papers/").terms[0]).toEqual({ kind: "in", folder: "papers", negate: false });
    expect(parseQuery("doi:*").terms[0]).toEqual({ kind: "has", field: "doi", negate: false });
    expect(parseQuery('deseq "single cell"').terms).toEqual([
      { kind: "text", value: "deseq", negate: false },
      { kind: "text", value: "single cell", negate: false },
    ]);
    // A value may itself contain colons.
    expect(parseQuery("mentions:GO:0006915").terms[0]).toMatchObject({ field: "mentions", values: ["GO:0006915"] });
  });

  it("reports mistakes instead of failing", () => {
    expect(parseQuery("type: limit:abc").errors).toEqual(["`type:` needs a value", "`limit:` needs a positive whole number, not `abc`"]);
    expect(parseQuery("-sort:year").errors).toEqual(["`sort:` can't be negated"]);
  });

  it("shows the fields a query uses as columns unless show: says otherwise", () => {
    expect(parseQuery("type:paper-review -has:dataset sort:-year").columns).toEqual(["type", "dataset", "year"]);
    expect(parseQuery("deseq").columns).toEqual(["type", "tags", "modified"]);
    expect(parseQuery("type:x show:doi,tag").columns).toEqual(["doi", "tags"]);
  });
});

describe("runQuery", () => {
  it("matches values case-insensitively, including list items", () => {
    expect(paths("type:paper-review")).toEqual(["papers/attention.md", "papers/deseq2.md", "papers/scvi.md"]);
    expect(paths("authors:huber")).toEqual(["papers/deseq2.md"]);
    expect(paths("type:code-review,guide")).toEqual(["welcome.md", "code-reviews/pipeline.md"]);
  });

  it("treats blank values as missing", () => {
    expect(paths("type:paper-review -has:dataset")).toEqual(["papers/attention.md", "papers/deseq2.md"]);
    expect(paths("has:meta")).toEqual(["papers/attention.md"]);
    expect(paths("meta.venue:neurips")).toEqual(["papers/attention.md"]);
    expect(paths("authors.0:love")).toEqual(["papers/deseq2.md"]);
  });

  it("compares numbers numerically and dates by prefix", () => {
    expect(paths("year:>=2017 sort:year")).toEqual(["papers/attention.md", "papers/scvi.md"]);
    expect(paths("year:2010..2017 sort:year")).toEqual(["papers/deseq2.md", "papers/attention.md"]);
    expect(paths("year:<2015")).toEqual(["papers/deseq2.md"]);
    expect(paths("modified:>=2026-09 sort:modified")).toEqual(["papers/deseq2.md", "papers/attention.md", "welcome.md"]);
    expect(paths("modified:<=2026-08")).toEqual(["papers/scvi.md", "code-reviews/pipeline.md"]);
  });

  it("supports contains, wildcards, folders and bare words", () => {
    expect(paths("title:~att")).toEqual(["papers/attention.md"]);
    expect(paths("status:run*")).toEqual(["code-reviews/pipeline.md"]);
    expect(paths("in:papers -year:2014")).toEqual(["papers/attention.md", "papers/scvi.md"]);
    expect(paths("review")).toEqual(["code-reviews/pipeline.md"]);
  });

  it("queries tags (nested), citations, IDs and links", () => {
    expect(paths("tag:stats")).toEqual(["papers/deseq2.md"]);
    expect(paths("#stat")).toEqual([]);
    expect(paths("tag:scrna*")).toEqual(["papers/scvi.md"]);
    expect(paths("cites:love2014moderated")).toEqual(["papers/deseq2.md"]);
    expect(paths("mentions:GSE*")).toEqual(["papers/scvi.md", "code-reviews/pipeline.md"]);
    expect(paths("mentions:ENSG00000141510")).toEqual(["code-reviews/pipeline.md"]);
    const resolve = (target: string) => (target.toLowerCase() === "deseq2" ? "papers/deseq2.md" : null);
    expect(runQuery(parseQuery("links:[[DESeq2]]"), NOTES, { resolve }).rows.map((r) => r.path)).toEqual(["code-reviews/pipeline.md"]);
  });

  it("sorts with missing values last, then applies limit", () => {
    const result = runQuery(parseQuery("sort:-year limit:2"), NOTES);
    expect(result.rows.map((r) => r.path)).toEqual(["papers/scvi.md", "papers/attention.md"]);
    expect(result.total).toBe(5);
    // No year: ordered by title after the rest.
    expect(paths("sort:year")).toEqual(["papers/deseq2.md", "papers/attention.md", "papers/scvi.md", "code-reviews/pipeline.md", "welcome.md"]);
  });

  it("returns column values and CSV", () => {
    const result = runQuery(parseQuery("title:DESeq2 show:authors,modified,journal"), NOTES);
    expect(result.rows[0].values).toEqual({ authors: ["Love", "Huber"], modified: day("2026-09-10"), journal: "Genome Biology" });
    expect(resultToCsv(result)).toBe("title,path,authors,modified,journal\nDESeq2,papers/deseq2.md,Love; Huber,2026-09-10,Genome Biology\n");
    expect(cellText("mentions", ["geo:GSE60450"])).toBe("GSE60450");
    expect(cellText("meta", { a: "b,c" })).toBe('{"a":"b,c"}');
  });
});

describe("helpers", () => {
  it("replaces the sort directive", () => {
    expect(withSort('type:x sort:year journal:"Genome Biology"', "title", false)).toBe('type:x journal:"Genome Biology" sort:title');
    expect(withSort("", "year", true)).toBe("sort:-year");
  });

  it("counts non-empty frontmatter fields", () => {
    expect(countFields(NOTES.map((n) => n.frontmatter)).slice(0, 3)).toEqual([
      { name: "type", count: 5 },
      { name: "title", count: 4 },
      { name: "year", count: 3 },
    ]);
  });

  it("turns ```query fences into query placeholders", async () => {
    const processor = unified().use(remarkParse).use(remarkRehype).use(rehypeQueryBlocks);
    const markdown = '> ```query title="Open reviews"\n> type:paper-review\n> -has:dataset\n> ```\n\n```python\nx = 1\n```';
    const tree = (await processor.run(processor.parse(markdown))) as HastRoot;
    const elements = tree.children.filter((c): c is Element => c.type === "element");
    const quoted = elements[0].children.find((c): c is Element => c.type === "element")!;
    expect(quoted).toEqual({
      type: "element",
      tagName: "div",
      properties: { dataQuery: "type:paper-review\n-has:dataset", dataQueryTitle: "Open reviews" },
      children: [],
    });
    expect(elements[1].tagName).toBe("pre");
  });
});
