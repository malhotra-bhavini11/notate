import type { Frontmatter } from "./types";

export interface NoteTemplate {
  id: string;
  label: string;
  description: string;
  /** Default folder for new notes of this kind. */
  folder: string;
  frontmatter: (title: string, date: string) => Frontmatter;
  body: (title: string) => string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "blank",
    label: "Blank note",
    description: "Title and date only.",
    folder: "",
    frontmatter: (title, date) => ({ title, date, tags: [] }),
    body: (title) => `# ${title}\n\n`,
  },
  {
    id: "paper-review",
    label: "Paper review",
    description: "Question, data, methods, statistics, limitations.",
    folder: "papers",
    frontmatter: (title, date) => ({
      title,
      type: "paper-review",
      authors: [],
      year: "",
      doi: "",
      tags: [],
      date,
    }),
    body: (title) => `# ${title}

## Research question

## Data
| Dataset | Organism / source | n | Accession |
|---|---|---|---|
|  |  |  |  |

## Methods
<!-- Model, assumptions, key equations. Inline math: $\\hat{\\beta}$; display math: $$ ... $$ -->

## Statistical approach
- Test / model:
- Multiple testing correction:
- Effect sizes reported:

## Key findings
1.

## Limitations & threats to validity

## Relevance to my work

## Follow-up reading
`,
  },
  {
    id: "code-review",
    label: "Code / pipeline review",
    description: "Pipeline stages, correctness, reproducibility, performance.",
    folder: "code-reviews",
    frontmatter: (title, date) => ({
      title,
      type: "code-review",
      repo: "",
      commit: "",
      tags: [],
      date,
    }),
    body: (title) => `# ${title}

## Scope
Files / modules reviewed:

## Pipeline overview
| Stage | Input | Output | Tool |
|---|---|---|---|
|  |  |  |  |

## Correctness

## Reproducibility
- [ ] Versions pinned (environment file / container)
- [ ] Random seeds fixed
- [ ] Reference genome / annotation versions recorded
- [ ] Parameters in config, not hard-coded

## Performance
Big-O / memory hotspots:

## Suggested changes
\`\`\`python

\`\`\`
`,
  },
  {
    id: "experiment-log",
    label: "Experiment log",
    description: "Hypothesis, setup, parameters, results, next steps.",
    folder: "experiments",
    frontmatter: (title, date) => ({
      title,
      type: "experiment",
      status: "running",
      tags: [],
      date,
    }),
    body: (title) => `# ${title}

## Hypothesis

## Setup
- Data:
- Code / commit:
- Environment:

## Parameters
| Parameter | Value |
|---|---|
|  |  |

## Results

## Interpretation

## Next steps
- [ ]
`,
  },
  {
    id: "concept",
    label: "Mathematical background",
    description: "Explain a concept: intuition first, then definitions, results, and a worked example.",
    folder: "math",
    frontmatter: (title, date) => ({
      title,
      type: "concept",
      field: "",
      prerequisites: [],
      tags: [],
      date,
    }),
    body: (title) => `# ${title}

> [!abstract] In one sentence
<!-- The idea in plain language, no notation. If you can't write this yet, write the rest first and come back. -->

## Why it matters
<!-- Where this shows up in your own work, and what it buys you. -->

## Intuition
<!-- The picture you'd draw on a whiteboard, before any formalism. -->

## Notation
| Symbol | Means | Lives in |
|---|---|---|
| $x$ |  |  |

> [!definition]
>

> [!theorem]
>

> [!proof]
>

## Worked example
> [!example]
> <!-- Smallest concrete case: real numbers, a tiny dataset, a 2x2 matrix. -->

## In code
\`\`\`python
\`\`\`

## Pitfalls
> [!warning]
> <!-- Assumptions people forget, edge cases, the thing that bit you. -->

## Open questions
> [!question]
>

## Related
<!-- [[Another concept]], and sources cited with [@key]. -->
`,
  },
  {
    id: "theorem-proof",
    label: "Theorem / proof",
    description: "Definitions, statement, proof sketch, examples.",
    folder: "math",
    frontmatter: (title, date) => ({
      title,
      type: "theorem",
      field: "",
      source: "",
      tags: [],
      date,
    }),
    body: (title) => `# ${title}

## Definitions
**Definition.**

## Statement
**Theorem.** Let $X_1, \\dots, X_n$ be ...

$$
\\lim_{n \\to \\infty} \\; ...
$$

## Proof
*Proof sketch.*

$\\blacksquare$

## Intuition

## Examples & counterexamples

## Related results
`,
  },
];

export const getTemplate = (id: string) => NOTE_TEMPLATES.find((t) => t.id === id) ?? NOTE_TEMPLATES[0];

/** Template frontmatter with presets placed right after the title (e.g. `source`, `citekey`). */
export function mergeFrontmatter(base: Frontmatter, preset: Frontmatter = {}): Frontmatter {
  const merged: Frontmatter = { title: base.title };
  for (const [key, value] of Object.entries(preset)) if (value !== undefined) merged[key] = value;
  for (const [key, value] of Object.entries(base)) if (!(key in merged)) merged[key] = value;
  return merged;
}
