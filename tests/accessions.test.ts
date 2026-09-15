import { describe, expect, it } from "vitest";

import { accessionForField, exactAccession, findAccessions, parseAccessionRef } from "@/lib/accessions";

const found = (text: string) => findAccessions(text).map((m) => [m.type.key, m.id, m.raw]);

describe("findAccessions: positives", () => {
  it.each([
    ["Counts from GSE60450.", "geo", "GSE60450", "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE60450"],
    ["samples GSM1480291 on GPL13112", "geo", "GSM1480291", undefined],
    ["run SRR1552450", "sra", "SRR1552450", "https://www.ncbi.nlm.nih.gov/sra/SRR1552450"],
    ["ENA ERR000001", "ena", "ERR000001", "https://www.ebi.ac.uk/ena/browser/view/ERR000001"],
    ["PRJNA257197 and PRJEB1234", "bioproject", "PRJNA257197", "https://www.ncbi.nlm.nih.gov/bioproject/PRJNA257197"],
    ["SAMN02981297", "biosample", "SAMN02981297", undefined],
    ["E-MTAB-513", "arrayexpress", "E-MTAB-513", "https://www.ebi.ac.uk/biostudies/arrayexpress/studies/E-MTAB-513"],
    ["TCGA via phs000178.v11.p8", "dbgap", "phs000178.v11.p8", undefined],
    ["EGAD00001000001", "ega", "EGAD00001000001", "https://ega-archive.org/datasets/EGAD00001000001"],
    ["TP53 is ENSG00000141510.18", "ensembl", "ENSG00000141510.18", "https://www.ensembl.org/id/ENSG00000141510"],
    ["mouse ENSMUSG00000059552", "ensembl", "ENSMUSG00000059552", undefined],
    ["NM_000546.6", "refseq", "NM_000546.6", "https://www.ncbi.nlm.nih.gov/nuccore/NM_000546.6"],
    ["NP_000537.3", "refseq", "NP_000537.3", "https://www.ncbi.nlm.nih.gov/protein/NP_000537.3"],
    ["SARS-CoV-2 MN908947.3", "genbank", "MN908947.3", "https://www.ncbi.nlm.nih.gov/nuccore/MN908947.3"],
    ["spike QHD43416.1", "genbank", "QHD43416.1", "https://www.ncbi.nlm.nih.gov/protein/QHD43416.1"],
    ["GRCh38 is GCF_000001405.40", "assembly", "GCF_000001405.40", undefined],
    ["Gene ID: 7157", "ncbigene", "7157", "https://www.ncbi.nlm.nih.gov/gene/7157"],
    ["HGNC:11998", "hgnc", "HGNC:11998", undefined],
    ["p53 is P04637", "uniprot", "P04637", "https://www.uniprot.org/uniprotkb/P04637/entry"],
    ["isoform Q9Y6K9-2", "uniprot", "Q9Y6K9-2", "https://www.uniprot.org/uniprotkb/Q9Y6K9/entry"],
    ["TrEMBL A0A024RBG1", "uniprot", "A0A024RBG1", undefined],
    ["AF-P04637-F1", "alphafold", "AF-P04637-F1", "https://alphafold.ebi.ac.uk/entry/P04637"],
    ["structure PDB 1TUP", "pdb", "1TUP", "https://www.rcsb.org/structure/1TUP"],
    ["pdb:6vxx", "pdb", "6VXX", "https://www.rcsb.org/structure/6VXX"],
    ["IPR011615", "interpro", "IPR011615", undefined],
    ["PF00870", "pfam", "PF00870", undefined],
    ["sickle cell rs334", "dbsnp", "rs334", "https://www.ncbi.nlm.nih.gov/snp/rs334"],
    ["VCV000015333", "clinvar", "VCV000015333", "https://www.ncbi.nlm.nih.gov/clinvar/variation/15333/"],
    ["OMIM #191170", "omim", "191170", "https://omim.org/entry/191170"],
    ["NCT04368728", "clinicaltrials", "NCT04368728", "https://clinicaltrials.gov/study/NCT04368728"],
    ["HeLa CVCL_0030", "cellosaurus", "CVCL_0030", undefined],
    ["apoptosis GO:0006915", "go", "GO:0006915", "https://www.ebi.ac.uk/QuickGO/term/GO:0006915"],
    ["T cell CL:0000084", "ontology", "CL:0000084", "https://www.ebi.ac.uk/ols4/ontologies/cl/classes?obo_id=CL%3A0000084"],
    ["R-HSA-109581", "reactome", "R-HSA-109581", undefined],
    ["MeSH D003920", "mesh", "D003920", undefined],
    ["human NCBITaxon:9606", "taxonomy", "9606", undefined],
    ["water CHEBI:15377", "chebi", "CHEBI:15377", undefined],
    ["aspirin CHEMBL25", "chembl", "CHEMBL25", undefined],
    ["see doi:10.1186/s13059-014-0550-8.", "doi", "10.1186/s13059-014-0550-8", "https://doi.org/10.1186/s13059-014-0550-8"],
    ["PMID: 25516281", "pubmed", "25516281", undefined],
    ["PMC4302049", "pmc", "PMC4302049", undefined],
    ["arXiv:1706.03762v7", "arxiv", "1706.03762v7", "https://arxiv.org/abs/1706.03762v7"],
  ])("%s", (text, key, id, url) => {
    const match = findAccessions(text).find((m) => m.type.key === key);
    expect(match?.id).toBe(id);
    if (url) expect(match?.url).toBe(url);
  });
});

describe("findAccessions: negatives", () => {
  it.each([
    "In 2024 we saw COVID-19 and H1N1 cases.",
    "Genes BRCA1, TP53, GAPDH, IL6, CD4 and p53 on chr17:7,668,402.",
    "RNA-seq v1.2.3 with SHA256 and E. coli K12.",
    "sample S1A2 and well A1, plot R2 = 0.93",
    "the PDB file format, pdb 2024, PMID alone, GO: terms",
    "https://example.org/GSE60450 and file_GSE60450.csv",
    "GSE60450abc and xGSE60450",
    "part numbers AB12345 and MN908947 without version",
  ])("%s", (text) => {
    expect(found(text)).toEqual([]);
  });
});

describe("overlaps and helpers", () => {
  it("prefers the longest match at a position", () => {
    expect(found("AF-P04637-F1")).toEqual([["alphafold", "AF-P04637-F1", "AF-P04637-F1"]]);
    expect(found("PDB 1TUP and P04637")).toEqual([
      ["pdb", "1TUP", "PDB 1TUP"],
      ["uniprot", "P04637", "P04637"],
    ]);
  });

  it("matches a whole frontmatter value only", () => {
    expect(exactAccession(" GSE60450 ")?.type.key).toBe("geo");
    expect(exactAccession("10.1186/s13059-014-0550-8")?.type.key).toBe("doi");
    expect(exactAccession("GSE60450 and more")).toBeNull();
  });

  it("uses the frontmatter field name for bare IDs", () => {
    expect(accessionForField("pmid", 25516281)?.url).toBe("https://pubmed.ncbi.nlm.nih.gov/25516281/");
    expect(accessionForField("arxiv", "1706.03762")?.url).toBe("https://arxiv.org/abs/1706.03762");
    expect(accessionForField("pdb", "6vxx")?.id).toBe("6VXX");
    expect(accessionForField("dataset", "GSE60450")?.type.key).toBe("geo");
    expect(accessionForField("pmid", "not a number")).toBeNull();
    expect(accessionForField("year", 2014)).toBeNull();
  });

  it("round-trips index refs", () => {
    expect(parseAccessionRef("go:GO:0006915")).toMatchObject({ id: "GO:0006915", url: "https://www.ebi.ac.uk/QuickGO/term/GO:0006915" });
    expect(parseAccessionRef("nope:1")).toBeNull();
  });
});
