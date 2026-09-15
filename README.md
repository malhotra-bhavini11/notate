# notate

A local web app for reviewing literature and code and keeping connected Markdown notes. All data is plain files in `workspace/`; there is no database. See [docs/prd.md](docs/prd.md).

## Run

```bash
npm install
npm run dev      # http://127.0.0.1:3000
```

On first run `workspace/` is created from `samples/workspace/`. It is git-ignored, so your notes stay out of the app repo. To keep notes elsewhere (e.g. a separate git repo or synced folder), set `WORKSPACE_DIR=/absolute/path`.

```bash
npm test         # vitest: path safety, frontmatter round-trip, tree, notes
npm run lint
npm run build
```

## Split view

`/split?file=<pdf or code>&note=<note.md>`. Toggle it with the header button or `Ctrl+\`.

- **Left pane:** PDFs render with react-pdf, with selectable text, clickable internal links, zoom, and page jump. Other files open in a line-numbered text view.
- **Right pane:** the note editor.
- **Divider:** drag it, or focus it and use ←/→, Home/End, or Enter to reset. Double-click also resets. The position is remembered per browser.
- **Tree clicks:** while split, notes open on the right and everything else opens on the left.
- **Linked notes:** a note with `source: path/to/file` in its frontmatter opens that file alongside it. "New note for <file>" in an empty note pane sets this for you.
- **Phones:** the panes stack vertically.

The pdf.js worker, fonts, cmaps and wasm are copied from `node_modules` into `public/pdfjs/` by `scripts/copy-pdfjs-assets.mjs`. This runs on install, `dev` and `build`, and the folder is git-ignored.

## Links and tags

- **Link syntax:** `[[target]]`, `[[target|shown text]]` or `[[target#Heading]]`. Type `[[` in the editor for suggestions.
- **Resolution order:** path (relative to the linking note, then from the root) → file name → note title → slugified text. `[[DESeq2 Notes]]` finds `deseq2-notes.md`. Ties prefer the linking note's folder, then the shallowest path.
- **Linking files:** `[[paper.pdf]]` needs the extension. In split view a linked file opens in the left pane and a linked note in the right.
- **Unresolved links** render dashed; click one to create the note.
- **Linked from** at the foot of each note lists every note whose links resolve to it, with the line numbers and lines.
- **Tags:** `#tag` or nested `#bio/rna-seq` inline, plus frontmatter `tags:`. `/tags/bio` includes nested `bio/*` tags. Numbers-only tags like `#42` are ignored.
- **Ignored contexts:** links and tags inside code blocks, inline code, math and URLs don't count. In tables, escape the alias pipe: `[[note\|text]]`.

## Code blocks

Fenced code in notes is highlighted with Shiki (`github-dark-default`) and gets a header with the language or title and a **Copy** button.

````markdown
```python title="qc.py" showLineNumbers {2}
counts = load_counts()
keep = counts.sum(axis=1) >= 10
counts = counts[keep]  # [!code ++]
counts = counts.dropna()  # [!code --]
```
````

- **Fence options:** `title="…"`, `showLineNumbers` and `{1,3-5}` (highlight lines).
- **Inline markers:** `// [!code highlight]`, `// [!code ++]` and `// [!code --]`, written with the language's own comment syntax.
- **Copy:** leaves out `--` lines, so you get the "after" version.
- **Languages:** Python, R, Julia, MATLAB, shell, SQL, Nextflow, YAML/JSON/TOML/XML/CSV, LaTeX, JS/TS, C/C++, Rust, Go, Java, Fortran, Docker, Make, CMake, diff and more. `snakemake`, `rscript` and `console` map to the nearest grammar; unknown languages render as plain text.
- **Code viewer:** the same highlighter colours files up to 8,000 lines. Larger files stay plain so the tab doesn't freeze.
- **Loading:** grammars load on first use, as separate chunks.

## API

| Route | Description |
|---|---|
| `GET /api/fs/tree` | Nested JSON tree of the workspace (`name, path, type, ext, mtime, size, children`) |
| `GET /api/notes?limit=20` | Recently modified notes with title, type, tags |
| `GET /api/index` | All notes (title, type, tags), linkable files and tag counts. Parsed notes are cached by mtime |
| `GET /api/backlinks/[...slug]` | Notes linking to a note or file, with `{ line, context }` for each mention |
| `GET /api/notes/[...slug]` | `{ path, frontmatter, content, mtime }` for a `.md` file |
| `POST /api/notes/[...slug]` | JSON `{ frontmatter?, content, createOnly? }`; atomic write; `409` if `createOnly` and the file exists |
| `GET /api/files/raw/[...slug]` | UTF-8 text for code/data files, `application/pdf` for PDFs; `415` for other binaries, `413` over 50 MB |

### Safety
The routes read and write real files, so:
- Paths are confined to the workspace: `..`, encoded slashes, dotfiles, Windows device names/ADS, and symlinks escaping the root are rejected.
- The dev server binds to `127.0.0.1`, and the API rejects non-localhost `Host` headers (DNS rebinding) and cross-origin `Origin`s (other browser tabs). Set `NOTATE_ALLOW_REMOTE=1` to disable the check.
- Notes render without raw HTML, and raw files are served with `nosniff`.
- YAML frontmatter uses the core schema, so `date: 2026-09-15` stays a string and is not rewritten as a timestamp on save.

## Layout

```
app/api/…            route handlers (thin; logic lives in lib/)
app/page.tsx         dashboard: recently edited notes
app/notes/[...slug]  note editor: frontmatter card, Write/Preview, 1 s autosave
app/files/[...slug]  full-width PDF / code view for a single file
app/split            dual-pane view (file left, note right)
components/          app shell, file tree, editor, KaTeX/GFM preview, new-note dialog, split panes
components/viewers/  react-pdf viewer, code viewer
lib/                 workspace path guard, tree, notes, frontmatter, templates
samples/workspace/   seed notes copied on first run
```
