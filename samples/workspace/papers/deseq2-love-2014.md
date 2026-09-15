---
title: DESeq2 – Moderated estimation of fold change and dispersion
citekey: love2014moderated
type: paper-review
authors: [Michael I. Love, Wolfgang Huber, Simon Anders]
year: 2014
doi: 10.1186/s13059-014-0550-8
tags: [rna-seq, differential-expression, empirical-bayes]
date: 2026-09-15
---

# DESeq2 (Love, Huber & Anders, *Genome Biology* 2014)

## Research question
How can we test for differential expression from RNA-seq read counts when there are few replicates? With so few samples, per-gene dispersion and fold-change estimates are noisy.

## Methods
Counts $K_{ij}$ for gene $i$ and sample $j$ follow a negative binomial GLM:

$$
K_{ij} \sim \mathrm{NB}(\mu_{ij}, \alpha_i), \qquad
\mu_{ij} = s_j \, q_{ij}, \qquad
\log_2 q_{ij} = \sum_r x_{jr} \, \beta_{ir}
$$

where $s_j$ is a sample size factor and $\alpha_i$ a gene-wise dispersion, so that
$\operatorname{Var}(K_{ij}) = \mu_{ij} + \alpha_i \mu_{ij}^2$.

## Statistical approach
| Step | Idea |
|---|---|
| Size factors | Median-of-ratios normalisation |
| Dispersion | Gene-wise estimates shrunk towards a fitted mean–dispersion trend (empirical Bayes) |
| Fold change | Shrunken log fold changes, which stabilise estimates for low-count genes |
| Testing | Wald test per coefficient; Benjamini–Hochberg adjustment |
| Outliers | Cook's distance flags influential counts |

## Limitations & threats to validity
- The NB assumption can be violated by strong zero inflation (e.g. single-cell data).
- Dispersion shrinkage assumes most genes share the mean–dispersion trend.

## Relevance to my work
Baseline method to compare against in batch-effect correction experiments.
