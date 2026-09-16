---
title: Negative binomial as a Gamma–Poisson mixture
type: theorem
field: probability
source: papers/deseq2-love-2014.md
tags: [stats, probability]
date: 2026-09-16
---

# Negative binomial as a Gamma–Poisson mixture

Why count models for RNA-seq use the negative binomial rather than the Poisson, written out. See [[deseq2-love-2014|the DESeq2 paper]].

> [!definition] Overdispersion
> A count variable $K$ is **overdispersed** relative to the Poisson when $\operatorname{Var}(K) > \mathbb{E}[K]$.

> [!theorem] Gamma–Poisson mixture
> Let $\Lambda \sim \operatorname{Gamma}(r, \theta)$ with shape $r$ and scale $\theta$, and let $K \mid \Lambda \sim \operatorname{Poisson}(\Lambda)$. Then
> $$
> K \sim \operatorname{NB}\!\left(r,\; p = \frac{\theta}{1 + \theta}\right),
> $$
> and in particular $\operatorname{Var}(K) = \mu + \mu^2 / r$ with $\mu = r\theta$.

> [!proof]
> Marginalise over $\Lambda$:
> $$
> \Pr(K = k) = \int_0^\infty \frac{\lambda^k e^{-\lambda}}{k!} \cdot \frac{\lambda^{r-1} e^{-\lambda/\theta}}{\Gamma(r)\theta^r} \, d\lambda .
> $$
> The integrand is an unnormalised $\operatorname{Gamma}(k + r,\; \theta/(1+\theta))$ density, so the integral is its normalising constant, giving
> $$
> \Pr(K = k) = \frac{\Gamma(k + r)}{k!\,\Gamma(r)} \left(\frac{1}{1+\theta}\right)^{r} \left(\frac{\theta}{1+\theta}\right)^{k}.
> $$
> The variance follows from the law of total variance: $\operatorname{Var}(K) = \mathbb{E}[\Lambda] + \operatorname{Var}(\Lambda) = \mu + \mu^2/r$.

> [!corollary] Poisson limit
> As $r \to \infty$ with $\mu$ fixed, $\operatorname{Var}(K) \to \mu$ and the negative binomial tends to $\operatorname{Poisson}(\mu)$.

> [!remark]
> DESeq2 writes the same variance as $\mu + \alpha\mu^2$, so its dispersion is $\alpha = 1/r$. Shrinking $\alpha$ across genes is what makes small experiments workable. #stats

> [!question] Open question for my own data
> Does the dispersion–mean trend hold for the low-count genes I keep after filtering, or should they be dropped first?
