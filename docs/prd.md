# Product Requirements Document (PRD): Code & Lit Research Hub

## 1. Product Overview
**Name:** ResearchHub (Placeholder)
**Goal:** A local web application for researchers and developers to seamlessly review literature, analyze code/pipelines, and take connected, organized markdown notes.
**Tech Stack (Recommended):**
- **Frontend:** Next.js (React), Tailwind CSS, Shadcn UI, Lucide Icons.
- **Backend/Data:** Local Markdown files (Next.js API routes using `fs` to read/write `.md` files).
- **Markdown Parsing:** `remark`/`rehype` (with syntax highlighting plugins like `rehype-pretty-code`).

## 2. Core User Flows
1. **Dashboard:** User opens the app and sees recently edited notes, a search bar, and a folder tree.
2. **Reviewing Code/Literature:** User clicks a "Split View" button. On the left pane, they load a file (PDF or `.py`/`.yaml` code). On the right pane, they open a markdown note to write insights.
3. **Connecting Ideas:** User types `[[keyword]]` in a note to create a bi-directional link to another note.

## 3. Key Features & Requirements

### Feature 1: File-System Based Markdown Editor
- **Description:** A rich-text/Markdown editor that reads and writes directly to a local `/notes` directory.
- **Requirements:**
  - Support standard Markdown, tables, and lists.
  - Render YAML frontmatter cleanly at the top of the UI.
  - Auto-save debounced to 1 second.

### Feature 2: Dual-Pane Viewer
- **Description:** A side-by-side layout for reading and taking notes simultaneously.
- **Requirements:**
  - Left pane: File viewer (PDF viewer using `react-pdf` OR a code viewer for plain text/code files).
  - Right pane: Active Markdown note editor.
  - Resizable divider between panes.

### Feature 3: Bi-Directional Linking & Tagging
- **Description:** Ability to link notes and view a note's "Backlinks" (notes that link to the current one).
- **Requirements:**
  - Parse `[[Note Name]]` syntax and render as clickable anchor tags.
  - A UI section at the bottom of each note displaying all incoming backlinks.
  - Support for `#tags`.

### Feature 4: Code & Pipeline Highlighting
- **Description:** Robust rendering of code snippets inside notes.
- **Requirements:**
  - Dark mode code blocks with syntax highlighting for Python, YAML, JSON, bash, etc.
  - A "Copy to clipboard" button on every code block.

## 4. Data Model & Architecture
- **Storage:** Local `.md` files. No SQL/NoSQL database required.
- **Note Structure Example:**
  ```yaml
  ---
  title: Analysis of Data Pipeline V2
  type: code-review
  tags: [etl, python, optimization]
  date: 2026-09-15
  ---

  6. Recommended Libraries
Markdown & Mathematics: Use the unified ecosystem. Specifically, remark-parse for standard markdown, remark-math and rehype-katex to natively render LaTeX equations and optimization formulas, and remark-gfm for tables.

Code & Syntax Highlighting: Use rehype-pretty-code. It provides excellent syntax highlighting for Python data processing scripts, XML clinical metadata, and JSON output directly within the markdown viewer.

PDF Viewer: Use react-pdf (a React wrapper for Mozilla's pdf.js) for parsing and rendering research papers in the left pane natively, avoiding clunky iframe implementations.

7. API Route Definitions (Next.js App Router)
The backend must rely solely on the Node.js fs module acting on a local /workspace folder, keeping all data purely local.

GET /api/fs/tree: Scans the designated workspace directory and returns a nested JSON object representing the folder structure. Used to populate the sidebar file tree.

GET /api/notes/[...slug]: Takes the file path slug, reads the file using fs.readFileSync, parses the YAML frontmatter using the gray-matter package, and returns both the frontmatter object and raw markdown content.

POST /api/notes/[...slug]: Receives updated markdown from the editor, safely overwrites the corresponding .md file, and returns a 200 OK status.

GET /api/files/raw/[...slug]: Designed for loading raw content into the left viewer pane. It returns the raw string of a file (ideal for viewing .py, .xml, or .csv datasets) or serves a PDF buffer with the correct application/pdf MIME type.