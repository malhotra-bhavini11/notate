import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseIdentifier } from "@/lib/citations/identifiers";
import { addReference, getReferencesDTO, LIBRARY_FILE } from "@/lib/citations/library";
import { lookupIdentifier } from "@/lib/citations/lookup";
import { WorkspaceError } from "@/lib/workspace";

const DESEQ2_CSL = {
  type: "journal-article", // Crossref's name; normalised to CSL's article-journal
  title: "Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2",
  author: [
    { family: "Love", given: "Michael I" },
    { family: "Huber", given: "Wolfgang" },
    { family: "Anders", given: "Simon" },
  ],
  issued: { "date-parts": [[2014, 12, 5]] },
  "container-title": "Genome Biology",
  volume: "15",
  issue: "12",
  DOI: "10.1186/S13059-014-0550-8",
  URL: "http://dx.doi.org/10.1186/s13059-014-0550-8",
  abstract: "<jats:title>Abstract</jats:title><jats:p>In comparative <jats:italic>high-throughput</jats:italic> assays…</jats:p>",
  reference: [{ key: "ref1" }],
  license: [{ URL: "https://creativecommons.org/licenses/by/4.0" }],
};

/** Fake network: doi.org redirects to Crossref, which returns CSL-JSON. */
function fakeFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404 });
    return route();
  }) as typeof fetch;
  return { fetcher, calls };
}

const redirect = (location: string) => () => new Response(null, { status: 302, headers: { location } });
const json = (body: unknown) => () => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

let root: string;
beforeAll(async () => {
  root = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "notate-cite-")), "workspace");
  await fs.mkdir(root, { recursive: true });
  process.env.WORKSPACE_DIR = root;
});
afterAll(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true });
});

describe("lookupIdentifier", () => {
  it("follows allowed redirects and keeps only citation fields", async () => {
    const { fetcher, calls } = fakeFetch({
      "https://doi.org/10.1186/s13059-014-0550-8": redirect("https://api.crossref.org/v1/works/10.1186%2Fs13059-014-0550-8/transform"),
      "https://api.crossref.org/v1/works/10.1186%2Fs13059-014-0550-8/transform": json(DESEQ2_CSL),
    });
    const item = await lookupIdentifier(parseIdentifier("10.1186/s13059-014-0550-8")!, fetcher);
    expect(calls).toHaveLength(2);
    expect(item.DOI).toBe("10.1186/s13059-014-0550-8");
    expect(item).not.toHaveProperty("reference");
    expect(item).not.toHaveProperty("license");
    expect(item.type).toBe("article-journal");
  });

  it("refuses redirects to hosts outside the allowlist", async () => {
    const { fetcher } = fakeFetch({
      "https://doi.org/10.5555/evil": redirect("http://127.0.0.1:3000/api/fs/tree"),
    });
    await expect(lookupIdentifier(parseIdentifier("10.5555/evil")!, fetcher)).rejects.toSatisfy(
      (e) => e instanceof WorkspaceError && e.status === 403,
    );
  });

  it("maps missing records to 404 and HTML landing pages to 'no metadata'", async () => {
    const { fetcher } = fakeFetch({
      "https://doi.org/10.5555/html": () => new Response("<html>landing</html>", { headers: { "content-type": "text/html" } }),
    });
    await expect(lookupIdentifier(parseIdentifier("10.5555/missing")!, fetcher)).rejects.toThrow(/No record found/);
    await expect(lookupIdentifier(parseIdentifier("10.5555/html")!, fetcher)).rejects.toThrow(/No citation metadata/);
  });

  it("uses arXiv's DataCite DOI and NCBI for PubMed IDs", async () => {
    const { fetcher, calls } = fakeFetch({
      "https://doi.org/10.48550/arXiv.1706.03762": json({ type: "article", title: "Attention Is All You Need", author: [{ family: "Vaswani", given: "Ashish" }] }),
      "https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=25516281": json({ ...DESEQ2_CSL, DOI: undefined }),
      "https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pmc/?format=csl&id=4302049": json(DESEQ2_CSL),
      // NCBI reports unknown IDs with a 200 and an error body.
      "https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=999999999": json({ id: [["A valid integer is required."]] }),
    });
    const arxiv = await lookupIdentifier(parseIdentifier("arXiv:1706.03762v7")!, fetcher);
    expect(arxiv).toMatchObject({ publisher: "arXiv", URL: "https://arxiv.org/abs/1706.03762" });
    const pubmed = await lookupIdentifier(parseIdentifier("PMID:25516281")!, fetcher);
    expect(pubmed.PMID).toBe("25516281");
    expect((await lookupIdentifier(parseIdentifier("PMC4302049")!, fetcher)).PMCID).toBe("PMC4302049");
    await expect(lookupIdentifier(parseIdentifier("999999999")!, fetcher)).rejects.toThrow(/No record found/);
    expect(calls).toHaveLength(4);
  });
});

describe("references.bib", () => {
  it("appends entries, formats APA, and parses them back", async () => {
    const ref = await addReference(structuredClone(DESEQ2_CSL), "love2014moderated");
    expect(ref.inText).toBe("Love et al., 2014");
    expect(ref.formatted).toMatch(/^Love, M\. I\., Huber, W\., & Anders, S\. \(2014\)\. Moderated estimation/);
    expect(ref.abstract).toBe("In comparative high-throughput assays…");
    expect(ref.bibtex).toMatch(/^@article\{love2014moderated,/);
    expect(ref.bibtex).not.toMatch(/abstract/);
    // Day dropped: BibTeX/biber reject `month = {dec 5}`.
    expect(ref.bibtex).toMatch(/month = \{12\},/);

    const { entries } = await getReferencesDTO();
    expect(entries.map((e) => [e.key, e.doi, e.year])).toEqual([["love2014moderated", "10.1186/s13059-014-0550-8", 2014]]);
  });

  it("rejects duplicate works and duplicate keys", async () => {
    await expect(addReference(structuredClone(DESEQ2_CSL), "another")).rejects.toThrow(/Already in references.bib as @love2014moderated/);
    await expect(addReference({ title: "Other", type: "book" }, "Love2014Moderated")).rejects.toThrow(/already used/);
    await expect(addReference({ title: "Other", type: "book" }, "bad key!")).rejects.toThrow(/Invalid citation key/);
  });

  it("keeps hand-written entries intact when appending", async () => {
    const file = path.join(root, LIBRARY_FILE);
    const handwritten = "@book{knuth1984texbook,\n  title = {The {TeXbook}},\n  author = {Knuth, Donald E.},\n  year = {1984}\n}";
    await fs.writeFile(file, `${(await fs.readFile(file, "utf8")).trimEnd()}\n\n${handwritten}\n`);
    await addReference({ type: "article", title: "Attention Is All You Need", author: [{ family: "Vaswani", given: "Ashish" }], issued: { "date-parts": [[2017]] }, DOI: "10.48550/arXiv.1706.03762" }, "vaswani2017attention");

    const text = await fs.readFile(file, "utf8");
    expect(text).toContain(handwritten);
    const { entries, error } = await getReferencesDTO();
    expect(error).toBeUndefined();
    expect(entries.map((e) => e.key)).toEqual(["love2014moderated", "knuth1984texbook", "vaswani2017attention"]);
    expect(entries.find((e) => e.key === "vaswani2017attention")!.arxiv).toBe("1706.03762");
  });
});
