---
title: Analysis of Data Pipeline V2
type: code-review
repo: pipelines
commit: ""
tags: [etl, python, optimization]
date: 2026-09-15
---

# Analysis of Data Pipeline V2

## Scope
`pipelines/normalize_counts.py` and `pipelines/config.yaml`

## Pipeline overview
| Stage | Input | Output | Tool |
|---|---|---|---|
| Load | `counts.tsv` | DataFrame | pandas |
| Filter | raw counts | expressed genes | `min_count` from config |
| Normalise | filtered counts | log-CPM | numpy |

## Correctness
1. `filter_expressed` compares **log-CPM** values against `min_count: 10`, a raw-count threshold. $\log_2 \mathrm{CPM} \ge 10$ means CPM $\ge 1024$, so almost every gene is dropped.
2. The filter runs after normalisation, so library sizes include genes that are later removed.

Filter on raw counts first, then normalise:

```python title="pipelines/normalize_counts.py" showLineNumbers
def main() -> None:
    cfg = load_config(Path(__file__).with_name("config.yaml"))
    counts = pd.read_csv(cfg["counts_path"], sep="\t", index_col=0)
    normalised = filter_expressed(log_cpm(counts), cfg["min_count"], cfg["min_samples"])  # [!code --]
    expressed = (counts >= cfg["min_count"]).sum(axis=1) >= cfg["min_samples"]  # [!code ++]
    normalised = log_cpm(counts.loc[expressed])  # [!code ++]
    normalised.to_csv(cfg["output_path"], sep="\t")
```

Diff lines use `# [!code ++]` / `# [!code --]`. Highlight lines with `{2-3}` after the language.

## Reproducibility
- [x] Parameters in config, not hard-coded
- [ ] Versions pinned
- [ ] Reference annotation version recorded

## Related
Downstream differential expression follows [[deseq2-love-2014]]. That method works on raw counts [@love2014moderated, sec. "Methods"], so log-CPM output is only for exploratory plots. #rna-seq #bio/normalisation

## Performance
`DataFrame.apply(..., axis=1)` over ~60k genes is $O(n \cdot m)$ in Python. The vectorised version above avoids the per-row overhead.
