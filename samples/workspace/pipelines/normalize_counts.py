"""Normalise an RNA-seq count matrix to log-CPM.

Sample file for notate; see code-reviews/data-pipeline-v2.md for the review.
"""

from pathlib import Path

import numpy as np
import pandas as pd
import yaml


def load_config(path: Path) -> dict:
    with path.open() as fh:
        return yaml.safe_load(fh)


def log_cpm(counts: pd.DataFrame, prior: float = 1.0) -> pd.DataFrame:
    library_size = counts.sum(axis=0)
    cpm = counts.apply(lambda row: row / library_size * 1e6, axis=1)
    return np.log2(cpm + prior)


def filter_expressed(cpm: pd.DataFrame, min_count: int, min_samples: int) -> pd.DataFrame:
    keep = (cpm >= min_count).sum(axis=1) >= min_samples
    return cpm.loc[keep]


def main() -> None:
    cfg = load_config(Path(__file__).with_name("config.yaml"))
    counts = pd.read_csv(cfg["counts_path"], sep="\t", index_col=0)
    normalised = filter_expressed(log_cpm(counts), cfg["min_count"], cfg["min_samples"])
    normalised.to_csv(cfg["output_path"], sep="\t")


if __name__ == "__main__":
    main()
