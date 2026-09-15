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

## Markdown features
| Feature | Syntax |
|---|---|
| Inline math | `$e^{i\pi} + 1 = 0$` renders as $e^{i\pi} + 1 = 0$ |
| Display math | `$$ ... $$` |
| Tables | GitHub-flavoured pipes |
| Task lists | `- [ ] todo` |

$$
\hat{\beta} = (X^\top X)^{-1} X^\top y
$$

- [x] Read the welcome note
- [ ] Write a paper review
