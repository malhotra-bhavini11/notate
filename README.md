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

## API

| Route | Description |
|---|---|
| `GET /api/fs/tree` | Nested JSON tree of the workspace (`name, path, type, ext, mtime, size, children`) |
| `GET /api/notes?limit=20` | Recently modified notes with title, type, tags |
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
app/files/[...slug]  plain viewer for non-note files (replaced by Feature 2's split view)
components/          app shell, file tree, editor, KaTeX/GFM preview, new-note dialog
lib/                 workspace path guard, tree, notes, frontmatter, templates
samples/workspace/   seed notes copied on first run
```
