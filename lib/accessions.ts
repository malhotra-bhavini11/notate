// Database identifiers (accessions) recognised in note text and turned into
// links: GEO/SRA datasets, Ensembl/RefSeq/UniProt entries, variants, ontology
// terms, trials, and literature IDs. Pure; shared by the preview and the index.
//
// Patterns favour precision over recall: short or ambiguous IDs (PDB codes,
// NCBI Gene/Taxonomy numbers, OMIM, PubMed) only match with an explicit prefix
// like "PDB 1TUP" or "PMID: 25516281", so years and gene symbols never link.

export type AccessionCategory =
  | "Sequencing & expression"
  | "Genes & sequences"
  | "Proteins & structures"
  | "Variants & clinical"
  | "Ontologies, pathways & chemistry"
  | "Literature";

export interface AccessionType {
  /** Stable key, e.g. `geo`. */
  key: string;
  /** Short database name shown in the UI. */
  name: string;
  description: string;
  category: AccessionCategory;
  /** Must capture the canonical identifier in group 1; the whole match is linked. */
  pattern: RegExp;
  url: (id: string) => string;
  /** Normalises the captured ID (case, trailing punctuation). */
  normalize?: (id: string) => string;
  /** Extra check after matching. */
  valid?: (id: string) => boolean;
}

const NCBI = "https://www.ncbi.nlm.nih.gov";
const ENA_VIEW = (id: string) => `https://www.ebi.ac.uk/ena/browser/view/${id}`;
const OLS = (id: string) => {
  const prefix = id.slice(0, id.indexOf(":")).toLowerCase();
  return `https://www.ebi.ac.uk/ols4/ontologies/${prefix}/classes?obo_id=${encodeURIComponent(id)}`;
};
const withoutVersion = (id: string) => id.replace(/\.\d+$/, "");

export const ACCESSION_TYPES: AccessionType[] = [
  // Sequencing & expression
  {
    key: "geo", name: "GEO", description: "Gene Expression Omnibus", category: "Sequencing & expression",
    pattern: /(G(?:SE|SM|PL|DS)\d{2,8})/,
    url: (id) => `${NCBI}/geo/query/acc.cgi?acc=${id}`,
  },
  {
    key: "sra", name: "SRA", description: "NCBI Sequence Read Archive", category: "Sequencing & expression",
    pattern: /(SR[RXSP]\d{6,9})/,
    url: (id) => `${NCBI}/sra/${id}`,
  },
  {
    key: "ena", name: "ENA", description: "European Nucleotide Archive / DDBJ reads", category: "Sequencing & expression",
    pattern: /([ED]R[RXSP]\d{6,9})/,
    url: ENA_VIEW,
  },
  {
    key: "bioproject", name: "BioProject", description: "INSDC BioProject", category: "Sequencing & expression",
    pattern: /(PRJ[NED][A-Z]\d{1,9})/,
    url: (id) => (id.startsWith("PRJN") ? `${NCBI}/bioproject/${id}` : ENA_VIEW(id)),
  },
  {
    key: "biosample", name: "BioSample", description: "INSDC BioSample", category: "Sequencing & expression",
    pattern: /(SAM(?:N|EA|E|D)\d{5,12})/,
    url: (id) => (id.startsWith("SAMN") ? `${NCBI}/biosample/${id}` : ENA_VIEW(id)),
  },
  {
    key: "arrayexpress", name: "ArrayExpress", description: "EMBL-EBI ArrayExpress / BioStudies", category: "Sequencing & expression",
    pattern: /(E-[A-Z]{4}-\d{1,7})/,
    url: (id) => `https://www.ebi.ac.uk/biostudies/arrayexpress/studies/${id}`,
  },
  {
    key: "dbgap", name: "dbGaP", description: "NCBI database of Genotypes and Phenotypes", category: "Sequencing & expression",
    pattern: /(phs\d{6}(?:\.v\d+\.p\d+)?)/,
    url: (id) => `${NCBI}/projects/gap/cgi-bin/study.cgi?study_id=${id}`,
  },
  {
    key: "ega", name: "EGA", description: "European Genome-phenome Archive", category: "Sequencing & expression",
    pattern: /(EGA[SD]\d{11})/,
    url: (id) => `https://ega-archive.org/${id.startsWith("EGAS") ? "studies" : "datasets"}/${id}`,
  },

  // Genes & sequences
  {
    key: "ensembl", name: "Ensembl", description: "Ensembl gene, transcript, or protein", category: "Genes & sequences",
    pattern: /(ENS(?:[A-Z]{3})?[GTPER]\d{11}(?:\.\d+)?)/,
    url: (id) => `https://www.ensembl.org/id/${withoutVersion(id)}`,
  },
  {
    key: "refseq", name: "RefSeq", description: "NCBI Reference Sequence", category: "Genes & sequences",
    pattern: /((?:N[MRCGTWZP]|X[MRP]|WP|YP|AP)_\d{6,9}(?:\.\d+)?)/,
    url: (id) => `${NCBI}/${/^[NXWYA]P_/.test(id) ? "protein" : "nuccore"}/${id}`,
  },
  {
    key: "genbank", name: "GenBank", description: "INSDC nucleotide or protein (versioned)", category: "Genes & sequences",
    // Versioned only (MN908947.3, QHD43416.1): bare letters+digits are too often part numbers.
    pattern: /([A-Z]{1,3}\d{5,6}\.\d{1,2})/,
    url: (id) => `${NCBI}/${/^[A-Z]{3}\d/.test(id) ? "protein" : "nuccore"}/${id}`,
  },
  {
    key: "assembly", name: "Assembly", description: "NCBI genome assembly", category: "Genes & sequences",
    pattern: /(GC[AF]_\d{9}\.\d+)/,
    url: (id) => `${NCBI}/datasets/genome/${id}/`,
  },
  {
    key: "ncbigene", name: "NCBI Gene", description: "NCBI Gene ID", category: "Genes & sequences",
    pattern: /(?:GeneID|Gene ID|NCBIGene|Entrez Gene(?: ID)?):\s?(\d{1,9})/,
    url: (id) => `${NCBI}/gene/${id}`,
  },
  {
    key: "hgnc", name: "HGNC", description: "HUGO Gene Nomenclature Committee", category: "Genes & sequences",
    pattern: /(HGNC:\d{1,6})/,
    url: (id) => `https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/${id}`,
  },

  // Proteins & structures
  {
    key: "alphafold", name: "AlphaFold DB", description: "Predicted protein structure", category: "Proteins & structures",
    pattern: /(AF-[A-Z0-9]{6,10}-F\d+)/,
    url: (id) => `https://alphafold.ebi.ac.uk/entry/${id.split("-")[1]}`,
  },
  {
    key: "uniprot", name: "UniProt", description: "UniProtKB protein", category: "Proteins & structures",
    // UniProt's documented accession format, plus optional isoform suffix.
    pattern: /((?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})(?:-\d{1,2})?)/,
    url: (id) => `https://www.uniprot.org/uniprotkb/${id.replace(/-\d+$/, "")}/entry`,
  },
  {
    key: "pdb", name: "PDB", description: "Protein Data Bank structure", category: "Proteins & structures",
    pattern: /(?:PDB|pdb)(?::\s?|\s|\s?ID:?\s)([1-9][A-Za-z0-9]{3})/,
    normalize: (id) => id.toUpperCase(),
    valid: (id) => /[A-Z]/i.test(id),
    url: (id) => `https://www.rcsb.org/structure/${id}`,
  },
  {
    key: "interpro", name: "InterPro", description: "InterPro protein family/domain", category: "Proteins & structures",
    pattern: /(IPR\d{6})/,
    url: (id) => `https://www.ebi.ac.uk/interpro/entry/InterPro/${id}/`,
  },
  {
    key: "pfam", name: "Pfam", description: "Pfam protein family", category: "Proteins & structures",
    pattern: /(PF\d{5})/,
    url: (id) => `https://www.ebi.ac.uk/interpro/entry/pfam/${id}/`,
  },

  // Variants & clinical
  {
    key: "dbsnp", name: "dbSNP", description: "NCBI dbSNP variant", category: "Variants & clinical",
    pattern: /(rs\d{3,12})/,
    url: (id) => `${NCBI}/snp/${id}`,
  },
  {
    key: "clinvar", name: "ClinVar", description: "NCBI ClinVar record", category: "Variants & clinical",
    pattern: /([RV]CV\d{9}(?:\.\d+)?)/,
    url: (id) =>
      id.startsWith("VCV")
        ? `${NCBI}/clinvar/variation/${Number(withoutVersion(id).slice(3))}/`
        : `${NCBI}/clinvar/${withoutVersion(id)}/`,
  },
  {
    key: "omim", name: "OMIM", description: "Online Mendelian Inheritance in Man", category: "Variants & clinical",
    pattern: /(?:OMIM|MIM):?\s?#?(\d{6})/,
    url: (id) => `https://omim.org/entry/${id}`,
  },
  {
    key: "clinicaltrials", name: "ClinicalTrials.gov", description: "Registered clinical trial", category: "Variants & clinical",
    pattern: /(NCT\d{8})/,
    url: (id) => `https://clinicaltrials.gov/study/${id}`,
  },
  {
    key: "cellosaurus", name: "Cellosaurus", description: "Cell line", category: "Variants & clinical",
    pattern: /(CVCL_[A-Z0-9]{4})/,
    url: (id) => `https://www.cellosaurus.org/${id}`,
  },

  // Ontologies, pathways & chemistry
  {
    key: "go", name: "GO", description: "Gene Ontology term", category: "Ontologies, pathways & chemistry",
    pattern: /(GO:\d{7})/,
    url: (id) => `https://www.ebi.ac.uk/QuickGO/term/${id}`,
  },
  {
    key: "ontology", name: "Ontology term", description: "OBO ontology term (HP, MONDO, UBERON, CL, DOID, EFO, SO)", category: "Ontologies, pathways & chemistry",
    pattern: /((?:HP|MONDO|UBERON|CL|DOID|EFO|SO):\d{4,7})/,
    url: OLS,
  },
  {
    key: "reactome", name: "Reactome", description: "Reactome pathway or reaction", category: "Ontologies, pathways & chemistry",
    pattern: /(R-[A-Z]{3}-\d{3,9}(?:\.\d+)?)/,
    url: (id) => `https://reactome.org/content/detail/${withoutVersion(id)}`,
  },
  {
    key: "mesh", name: "MeSH", description: "Medical Subject Heading", category: "Ontologies, pathways & chemistry",
    pattern: /(?:MeSH|MESH):?\s?([DC]\d{6,9})/,
    url: (id) => `https://meshb.nlm.nih.gov/record/ui?ui=${id}`,
  },
  {
    key: "taxonomy", name: "NCBI Taxonomy", description: "Organism", category: "Ontologies, pathways & chemistry",
    pattern: /(?:NCBITaxon|[Tt]axon|[Tt]axid|[Tt]xid):?\s?(\d{1,7})/,
    url: (id) => `${NCBI}/Taxonomy/Browser/wwwtax.cgi?id=${id}`,
  },
  {
    key: "chebi", name: "ChEBI", description: "Chemical Entities of Biological Interest", category: "Ontologies, pathways & chemistry",
    pattern: /(CHEBI:\d{1,7})/,
    url: (id) => `https://www.ebi.ac.uk/chebi/${id}`,
  },
  {
    key: "chembl", name: "ChEMBL", description: "ChEMBL compound", category: "Ontologies, pathways & chemistry",
    pattern: /(CHEMBL\d{1,9})/,
    url: (id) => `https://www.ebi.ac.uk/chembl/explore/compound/${id}`,
  },

  // Literature
  {
    key: "doi", name: "DOI", description: "Digital Object Identifier", category: "Literature",
    pattern: /(?:doi:\s?)?(10\.\d{4,9}\/[^\s"'<>[\]]+)/i,
    // Prose often ends a DOI with punctuation that isn't part of it.
    normalize: (id) => id.replace(/[.,;:)]+$/, ""),
    url: (id) => `https://doi.org/${id}`,
  },
  {
    key: "pubmed", name: "PubMed", description: "PubMed record", category: "Literature",
    pattern: /(?:PMID|PubMed(?: ID)?):?\s?(\d{1,9})/,
    url: (id) => `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
  },
  {
    key: "pmc", name: "PMC", description: "PubMed Central article", category: "Literature",
    pattern: /(PMC\d{5,9})/,
    url: (id) => `https://pmc.ncbi.nlm.nih.gov/articles/${id}/`,
  },
  {
    key: "arxiv", name: "arXiv", description: "arXiv preprint", category: "Literature",
    pattern: /(?:arXiv|arxiv):\s?(\d{4}\.\d{4,5}(?:v\d+)?)/,
    url: (id) => `https://arxiv.org/abs/${id}`,
  },
];

export const ACCESSION_TYPE_BY_KEY = new Map(ACCESSION_TYPES.map((t) => [t.key, t]));

export interface AccessionMatch {
  type: AccessionType;
  /** Canonical identifier, e.g. `GSE60450` or `1TUP`. */
  id: string;
  /** The linked text as written, e.g. `PDB 1TUP`. */
  raw: string;
  start: number;
  url: string;
}

// Identifiers must stand alone: no letter, digit, or underscore touching either
// end, and not glued to a path, domain, or another ID with `/`, `.`, or `-`.
const compiled = ACCESSION_TYPES.map((type) => ({
  type,
  re: new RegExp(`(?<![\\p{L}\\p{N}_/.\\-])${type.pattern.source}(?![\\p{L}\\p{N}_]|[.\\-/][\\p{L}\\p{N}])`, `gu${type.pattern.flags.includes("i") ? "i" : ""}`),
}));

/** Non-overlapping identifiers in `text`, earliest first (longest wins at the same start). */
export function findAccessions(text: string): AccessionMatch[] {
  const found: AccessionMatch[] = [];
  for (const { type, re } of compiled) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const id = type.normalize ? type.normalize(m[1]) : m[1];
      if (type.valid && !type.valid(id)) continue;
      // Trim trailing characters the normaliser dropped (e.g. a DOI's final period).
      const raw = m[0].slice(0, m[0].length - (m[1].length - id.length));
      found.push({ type, id, raw, start: m.index, url: type.url(id) });
    }
  }
  found.sort((a, b) => a.start - b.start || b.raw.length - a.raw.length);
  const kept: AccessionMatch[] = [];
  let end = -1;
  for (const match of found) {
    if (match.start < end) continue;
    kept.push(match);
    end = match.start + match.raw.length;
  }
  return kept;
}

/** The accession if `value` is exactly one identifier (used for frontmatter fields). */
export function exactAccession(value: string): AccessionMatch | null {
  const trimmed = value.trim();
  const [match] = findAccessions(trimmed);
  return match && match.start === 0 && match.raw === trimmed ? match : null;
}

// Frontmatter fields whose name says what a bare value is (`pmid: 25516281`).
const FIELD_TYPES: Record<string, string> = {
  doi: "doi",
  pmid: "pubmed",
  pubmed: "pubmed",
  pmcid: "pmc",
  arxiv: "arxiv",
  pdb: "pdb",
  taxid: "taxonomy",
  taxon: "taxonomy",
  gene_id: "ncbigene",
  geneid: "ncbigene",
};

/** An accession for a frontmatter value: any exact identifier, or a bare ID named by its field. */
export function accessionForField(field: string, value: unknown): AccessionMatch | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  const exact = exactAccession(text);
  if (exact) return exact;

  const type = ACCESSION_TYPE_BY_KEY.get(FIELD_TYPES[field.toLowerCase()] ?? "");
  if (!type) return null;
  const id = type.normalize ? type.normalize(text) : text;
  // Re-check against the type's own pattern by rebuilding the prefixed form it expects.
  const prefixed = { pubmed: `PMID: ${id}`, arxiv: `arXiv:${id}`, pdb: `PDB ${id}`, taxonomy: `taxid:${id}`, ncbigene: `GeneID:${id}` }[type.key];
  const [match] = prefixed ? findAccessions(prefixed) : [];
  return match?.type.key === type.key ? { ...match, raw: text, start: 0 } : null;
}

/** `geo:GSE60450` — how notes record which identifiers they mention. */
export const accessionRef = (m: { type: { key: string }; id: string }) => `${m.type.key}:${m.id}`;

export function parseAccessionRef(ref: string): { type: AccessionType; id: string; url: string } | null {
  const colon = ref.indexOf(":");
  const type = ACCESSION_TYPE_BY_KEY.get(ref.slice(0, colon));
  if (!type) return null;
  const id = ref.slice(colon + 1);
  return { type, id, url: type.url(id) };
}
