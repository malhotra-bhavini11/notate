---
title: Welcome to notate
type: guide
tags: [getting-started]
date: 2026-09-15
---

# Welcome

Everything here is a plain Markdown file in the `workspace/` folder. Edit notes in the app or in any editor. The app picks up outside changes when you switch back to its tab.

## Basics
- **New note**: the `+` in the sidebar, or `Ctrl+Alt+N`. Templates: paper review, code/pipeline review, experiment log, theorem/proof.
- **Autosave**: 1 second after you stop typing. `Ctrl+S` saves immediately.
- **Frontmatter** (title, type, date, tags, custom fields) is edited in the card above the note body.
- **Filter files**: `Ctrl+K`.

## Linking notes
- Type `[[` to link another note; suggestions appear as you type. `[[deseq2-love-2014|the DESeq2 paper]]` shows custom link text.
- Links match file names, titles, or paths, so [[DESeq2 – Moderated estimation of fold change and dispersion]] works too.
- `[[notate-sample.pdf]]` links a file. In split view it opens in the left pane.
- An unresolved link like [[My next idea]] shows dashed. Click it to create that note.
- Every note lists the notes that link to it under **Linked from**.
- Tag inline with #getting-started, or nest tags like #bio/rna-seq. Click a tag to see every note that has it.

## Citations
- **Import citation** (sidebar) takes a DOI, PubMed ID, PMC ID, arXiv ID, or a link. It adds the entry to `references.bib` and can create a reading note.
- Cite with `[@key]`, `[@key, p. 3]`, or `[@a; @b]`. Type `[@` for suggestions. For example, DESeq2 [@love2014moderated] and transformers [@vaswani2017attention].
- The preview ends with a formatted **References** list. The References page shows every entry and the notes that cite it.

## Database identifiers
Accessions link to their database automatically:
- **Datasets:** GSE60450, SRA, ENA, BioProject, ArrayExpress, dbGaP, EGA
- **Genes and proteins:** ENSG00000141510 (TP53), UniProt P04637, PDB 1TUP, InterPro, Pfam
- **Variants:** dbSNP rs334, ClinVar
- **Ontologies:** GO:0006915, CL, HP, MONDO
- **Trials:** NCT04368728
- **Literature:** DOIs, PMIDs, arXiv IDs

Short or ambiguous IDs need a prefix, e.g. `PDB 1TUP`, `PMID: 25516281`, `taxid:9606`. **IDs** in the sidebar lists every identifier and the notes that mention it.

## Queries
**Query** in the sidebar finds notes by their frontmatter, tags, citations, IDs, and links, e.g. `type:paper-review tag:rna-seq -has:dataset year:>=2010 sort:-year`.

A `query` code block keeps a live table in a note:

```query title="Paper reviews without a dataset"
type:paper-review -has:dataset sort:-year show:year,doi,tags
```

## Markdown features
| Feature | Syntax |
|---|---|
| Inline math | `$e^{i\pi} + 1 = 0$` renders as $e^{i\pi} + 1 = 0$ |
| Display math | `$$ ... $$` |
| Tables | GitHub-flavoured pipes |
| Task lists | `- [ ] todo` |
| Code blocks | ` ```python title="qc.py" showLineNumbers {2-3} ` |
| Diff / highlight a line | `# [!code ++]`, `# [!code --]`, `# [!code highlight]` at the end of the line |

$$
\hat{\beta} = (X^\top X)^{-1} X^\top y
$$

- [x] Read the welcome note
- [ ] Write a paper review
