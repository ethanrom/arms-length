# Numbers ledger

Every number quoted in the README, video and Devpost comes from this file. Regenerate with `npx tsx scripts/docs/numbers.ts --write`.

The file is generated from the code, the recorded fixtures (`fixtures/youcam/`) and the committed results (`eval/results/`, `eval/llm-baseline/results/`). Each table says where a value comes from and how to get it again. Where a value cannot be computed it says **manual** and where it comes from. `npx tsx scripts/docs/numbers.ts --check` re-measures everything and fails on a difference, and `lib/vision/numbers.doc.test.ts` fails when this file is stale (see the last section). Tone and wording follow the product: distances, not grades.

The four faces are synthetic (AI-generated) portraits; nobody real is shown.

## Headline numbers

<!-- generated:headline:start -->

Each row is a value from a section below (the last column), picked up by the generator rather than typed.

| What | Value | Section |
| --- | --- | --- |
| Model against human thresholds | 0.69 dB RMS over 41 ModelFest patterns (the paper reports 1.03 dB over all 43, which include 2 patterns we cannot generate, so the two figures are not like-for-like) | 1 |
| Skin-shaped patterns | 0.78 dB | 1 |
| Human observers behind it | 16 | 1 |
| How much people differ | individual observers sit 3.46 dB RMS from the observer mean; the most sensitive observer sits 4.2 dB below it | 1 |
| castleCSF port against its reference (largest deviation) | 4.2e-7 log10 (test tolerance 0.0001) | 1.1 |
| Five analytic stimuli against the numpy prediction (worst) | 0.029 dB (test tolerance 0.1 dB) | 1.1 |
| The iris as a ruler | 11.71 mm +/- 0.42 mm (3.6%) | 2 |
| Mask-based scale against the iris scale | 0.1% to 4.8% from the iris scale, four faces | 2 |
| A 3 mm, 12% spot | 3.2 m typical, 4.8 m bound | 7 |
| The safety margin | 6 dB: x1.50 in distance for a 3 mm spot, x1.48 to x1.99 across the seven example features | 7 |
| Pores out of sight at 1.5 m on p2b | 78% typical, 47% bound (649 found) | 3 |
| AI baseline calls and cost | 65 calls, $1.11 | 4 |
| AI run-to-run spread, same question | CV 27% (median); highest of five asks 1.4x to 2.1x the lowest | 4 |
| AI against our distance | 1.33x off (geometric mean); 23 of 45 answers inside our range | 4 |
| AI on real faces | pores 0.8 m on all 4 faces; breakouts null on 3 faces where YouCam found 18, 5, 3 | 4 |
| YouCam units | 16 per analysis, 26 per full session | 5 |
| Measured route latency | 821 ms | 5 |

Test counts and units spent and left are in sections 6 and 5; they are measured separately.

<!-- generated:headline:end -->

<!-- generated:headline-worthit:start -->

More headline rows, from the half-strength Skin Simulation search (section 3.2). They sit in their own block because that search is slow, so `npm test` guards them with a hash rather than recomputing them.

| What | Value | Section |
| --- | --- | --- |
| Pores: share of a half-strength change detectable across a table | 4% to 14%, across the four faces (bound, at 1.5 m) | 3.2 |
| Under-eye: how far a half-strength change stays detectable | Under-eye shadows: farthest change at the 10 m cap on 4 of 4 faces, median too on 4 of 4; Under-eye puffiness: farthest change at the 10 m cap on 4 of 4 faces, median too on 4 of 4 | 3.2 |

<!-- generated:headline-worthit:end -->

## 1. ModelFest: the model against human observers

<!-- generated:modelfest:start -->

Our detector is Watson and Ahumada's Standard A (2005), run on the ModelFest stimuli at 30 cd/m^2 with no safety margin. `npx tsx eval/run.ts --detector=standard` rewrites `eval/results/modelfest.json` from the code.

| Number | Value | Source | Reproduce |
| --- | --- | --- | --- |
| Analytic stimuli scored | 41 of 43 | `eval/results/modelfest.json` `nAll`; `eval/modelfest/thresholds.json` `stimuli` | `npx tsx eval/run.ts --detector=standard` |
| Stimuli left out | 2 (#35, #43: random or photographic pixel content) | `eval/results/modelfest.json` `excluded` | `npx tsx eval/run.ts --detector=standard` |
| RMS error, all scored stimuli | 0.69 dB | `eval/results/modelfest.json` `rmsAllDb` | `npx tsx eval/run.ts --detector=standard` |
| RMS error, the skin-relevant shapes | 0.78 dB over 8 shapes (#26, #27, #28, #29, #30, #31, #32, #40) | `eval/results/modelfest.json` `rmsSkinDb`, `nSkin` | `npx tsx eval/run.ts --detector=standard` |
| Largest single error | 1.95 dB (#31, Line 0.5 arcmin x Gaussian) | `eval/results/modelfest.json` `results[].errorDb` | `npx tsx eval/run.ts --detector=standard` |
| The paper's own RMS, Standard A, all 43 stimuli | 1.03 dB. Not like-for-like with the 0.69 dB above: the paper's figure includes #35 and #43, which cannot be generated from parameters | `eval/results/modelfest.json` `published.standardA.rmsAll43Db` (Watson and Ahumada 2005, Table 5) | manual: Table 5 of the paper (doi 10.1167/5.9.6) |
| Stimuli in the ModelFest set | 43 | `eval/modelfest/thresholds.json` `stimuli` | `grep -c '"thresholdDb"' eval/modelfest/thresholds.json` |
| Human observers behind the thresholds | 16 (4 repeats each) | `eval/modelfest/thresholds.json` `source.observers`, `source.repeatsPerObserver` | `grep -n '"observers"' eval/modelfest/thresholds.json` |
| How far individual observers sit from the observer mean (RMS over all observers and stimuli) | 3.46 dB RMS (the paper's RMS0) | `eval/modelfest/thresholds.json` `source.checks.rms0Db`, computed from the per-observer CSV by `scripts/eval/extract-modelfest.ts` and checked there against the paper's 3.46 | `grep -n rms0Db eval/modelfest/thresholds.json`; recomputing needs the CSV (not redistributed): `npx tsx scripts/eval/extract-modelfest.ts <modelfestbaselinedata.csv>` |
| How far the most sensitive observer sits below the mean | 4.2 dB (the second most sensitive: 3.95 dB) | manual: the research derivation from the per-observer data, as written in the "Why 6 dB" table of `docs/MODEL.md` (read from that row); it is the basis of `DEFAULT_MARGIN_DB` = 6. The per-observer data are not in the repository, so this value cannot be recomputed from committed files | manual: needs the per-observer CSV; `scripts/eval/extract-modelfest.ts` shows its layout |

<!-- generated:modelfest:end -->

### 1.1 Reproducing the published models

<!-- generated:reference:start -->

Both are re-run here from the rows the unit tests use (read from the test files), so the measured deviation sits next to the tolerance the test allows. The reference values in the tests are written to 6 decimals, so deviations of a few 1e-7 are rounding in the reference. The distance from the dataset's own measured value is how well castleCSF itself fits its data, not an error of the port.

| Number | Value | Source | Reproduce |
| --- | --- | --- | --- |
| castleCSF port: largest deviation from its reference port | 4.2e-7 in log10 sensitivity over 5 dataset rows (worst: modelfest 4 cpd (achromatic)); the test allows 0.0001 | `lib/vision/castle.test.ts`, run against `coneSensitivity` and `discConeSensitivity` in `lib/vision/castle.ts` | `npx vitest run lib/vision/castle.test.ts`; `npx tsx scripts/docs/numbers.ts --section reference` |
| castleCSF port: largest distance from the dataset's own measured value | 3.76 dB on the Gabor rows (the test allows 4), 2.93 dB on the disc rows (allows 3.5) | `lib/vision/castle.test.ts` | `npx tsx scripts/docs/numbers.ts --section reference` |
| Five analytic ModelFest stimuli (#26-29, #40): worst deviation from the independent numpy prediction, computed directly | 0.029 dB (#26 Gaussian sd 30'); the test allows 0.1 dB | `lib/vision/standard.test.ts`, run against `blobThreshold` in `lib/vision/shapes.ts` | `npx vitest run lib/vision/standard.test.ts`; `npx tsx scripts/docs/numbers.ts --section reference` |
| The same five, through the lookup tables the app uses | 0.029 dB (#26 Gaussian sd 30'); the test allows 0.1 dB | `lib/vision/standard.test.ts`, run against `blobThresholdLookup` in `lib/vision/tables.ts` | `npx tsx scripts/docs/numbers.ts --section reference` |

<!-- generated:reference:end -->

## 2. The iris ruler

<!-- generated:iris:start -->

| Number | Value | Source | Reproduce |
| --- | --- | --- | --- |
| Iris diameter, population mean | 11.71 mm | `IRIS_DIAMETER_MM` in `lib/scale/iris.ts` (Rufer, Schroder and Erb 2005, Cornea 24(3):259-261) | `grep -n IRIS_DIAMETER lib/scale/iris.ts` |
| Iris diameter, population SD | 0.42 mm (3.6% of the mean) | `IRIS_DIAMETER_SD_MM`, `IRIS_POPULATION_REL_SD` in `lib/scale/iris.ts` | `npx vitest run lib/scale/scale.test.ts` |
| mm per pixel, the four faces | 0.1630 to 0.1757 | `fixtures/youcam/<face>/scale.json` (made by `scripts/scale/fixtures.ts`) | `npx tsx scripts/scale/fixtures.ts p1a` (needs headless Chrome) |
| Mask-based scale vs the iris scale, the four faces (HD masks) | 0.1% to 4.8% different (`lib/scale/fromMasks.test.ts` asserts under 10% on p2b and p3a) | `estimateScaleFromMasks` in `lib/scale/fromMasks.ts`, run on the recorded masks | `npx tsx scripts/docs/numbers.ts --section iris`; `npx vitest run lib/scale/fromMasks.test.ts` |
| Mask-based scale vs the iris scale, including p2b on SD masks | 0.1% to 4.8% different | `estimateScaleFromMasks` in `lib/scale/fromMasks.ts`, run on the recorded masks | `npx tsx scripts/docs/numbers.ts --section iris` |
| Interpupillary distance assumed for the mask-based scale | 63 mm, SD 3.5 mm | `IPD_MM`, `IPD_SD_MM` in `lib/scale/fromMasks.ts` | `grep -n IPD_ lib/scale/fromMasks.ts` |

Per face. Positive means the mask-based scale gives more millimetres per pixel than the iris.

| Face | Frame (px) | Iris (px) | mm per px (iris) | Scale uncertainty (1 SD) | mm per px (masks) | Masks vs iris |
| --- | --- | --- | --- | --- | --- | --- |
| p1a | 1080 x 1610 | 71.8 | 0.1630 | 3.8% | 0.1709 (eye-regions) | +4.8% |
| p2b | 1080 x 1341 | 68.9 | 0.1699 | 3.9% | 0.1700 (eye-regions) | +0.1% |
| p3a | 1080 x 1575 | 66.7 | 0.1757 | 3.9% | 0.1836 (eye-regions) | +4.5% |
| p5a | 1080 x 1350 | 66.8 | 0.1754 | 3.9% | 0.1791 (eye-regions) | +2.1% |
| p2b (SD masks) | 1080 x 1341 | - | - | - | 0.1686 (eye-regions) | -0.7% |

Source: `fixtures/youcam/<face>/scale.json` (made by `scripts/scale/fixtures.ts`) for the iris columns; `estimateScaleFromMasks` in `lib/scale/fromMasks.ts`, run on the recorded masks for the mask columns. Reproduce: `npx tsx scripts/docs/numbers.ts --section iris`.

<!-- generated:iris:end -->

## 3. The four demo faces: what was found

<!-- generated:persona-found:start -->

Targets are what the model judges one by one: the measured marks (pores, dark spots, breakouts, fine lines) and the larger regions (under-eye shadows, under-eye puffiness, redness zones). Markers that sit inside a dark spot are counted once, as the spot.

| Face | Marks measured | Regions measured | Pores | Dark spots | Breakouts | Fine lines | Under-eye shadows | Under-eye puffiness | Redness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| p1a | 647 | 9 | 450 | 64 | 40 | 93 | 2 | 2 | 5 |
| p2b | 944 | 4 | 649 | 89 | 18 | 188 | 2 | 2 | 0 |
| p3a | 627 | 9 | 221 | 194 | 5 | 207 | 3 | 2 | 4 |
| p5a | 413 | 4 | 250 | 53 | 3 | 107 | 2 | 2 | 0 |

Source: `lib/skin` `measureAnalysis` then `lib/vision` `buildVisibilityReport` at `DEFAULT_VIEWING` (45 cd/m^2, 20/20, margin 6 dB), with `scale.json`; the same path as `scripts/dev/pipeline.ts`. Reproduce: `npx tsx scripts/dev/pipeline.ts p1a p2b p3a p5a` or `npx tsx scripts/docs/numbers.ts --section persona-found`.

<!-- generated:persona-found:end -->

### 3.1 Out of sight at 1 m and 1.5 m

<!-- generated:persona-sight:start -->

The share of each concern's targets that is out of sight at that distance. **Typical** is the average observer (margin 0). **Bound** is the one-sided claim: not visible even to a sharp-eyed 20/20 observer with a 6 dB margin, so it is the smaller share. Pooled rows add the counts of every concern the face has; pores dominate them.

| Face | Concern | Found | 1 m typical | 1 m bound | 1.5 m typical | 1.5 m bound |
| --- | --- | --- | --- | --- | --- | --- |
| p1a | Pores | 450 | 67% | 33% | 92% | 67% |
| p1a | Dark spots | 64 | 8% | 0% | 23% | 3% |
| p1a | Breakouts | 40 | 35% | 7% | 73% | 40% |
| p1a | Fine lines | 93 | 38% | 19% | 59% | 33% |
| p1a | Under-eye shadows | 2 | 0% | 0% | 0% | 0% |
| p1a | Under-eye puffiness | 2 | 0% | 0% | 0% | 0% |
| p1a | Redness | 5 | 0% | 0% | 0% | 0% |
| **p1a** | **All targets together** | **656** | **54%** | **26%** | **78%** | **53%** |
| p2b | Pores | 649 | 46% | 27% | 78% | 47% |
| p2b | Dark spots | 89 | 1% | 1% | 8% | 1% |
| p2b | Breakouts | 18 | 17% | 6% | 78% | 28% |
| p2b | Fine lines | 188 | 24% | 14% | 38% | 23% |
| p2b | Under-eye shadows | 2 | 0% | 0% | 0% | 0% |
| p2b | Under-eye puffiness | 2 | 0% | 0% | 0% | 0% |
| **p2b** | **All targets together** | **948** | **37%** | **22%** | **63%** | **38%** |
| p3a | Pores | 221 | 66% | 24% | 91% | 63% |
| p3a | Dark spots | 194 | 5% | 1% | 23% | 4% |
| p3a | Breakouts | 5 | 0% | 0% | 60% | 0% |
| p3a | Fine lines | 207 | 28% | 12% | 49% | 23% |
| p3a | Under-eye shadows | 3 | 0% | 0% | 0% | 0% |
| p3a | Under-eye puffiness | 2 | 0% | 0% | 0% | 0% |
| p3a | Redness | 4 | 25% | 25% | 25% | 25% |
| **p3a** | **All targets together** | **636** | **33%** | **13%** | **55%** | **31%** |
| p5a | Pores | 250 | 81% | 38% | 98% | 78% |
| p5a | Dark spots | 53 | 9% | 0% | 23% | 6% |
| p5a | Breakouts | 3 | 0% | 0% | 67% | 0% |
| p5a | Fine lines | 107 | 54% | 22% | 76% | 44% |
| p5a | Under-eye shadows | 2 | 0% | 0% | 0% | 0% |
| p5a | Under-eye puffiness | 2 | 0% | 0% | 0% | 0% |
| **p5a** | **All targets together** | **417** | **64%** | **28%** | **82%** | **59%** |

Source: `lib/skin` `measureAnalysis` then `lib/vision` `buildVisibilityReport` at `DEFAULT_VIEWING` (45 cd/m^2, 20/20, margin 6 dB), with `scale.json`; the same path as `scripts/dev/pipeline.ts`; the shares are 1 minus `profile` (bound) and `nominalProfile` (typical) at 1 m and 1.5 m. Reproduce: `npx tsx scripts/dev/pipeline.ts p1a p2b p3a p5a` (prints the bound profile) or `npx tsx scripts/docs/numbers.ts --section persona-sight`.

<!-- generated:persona-sight:end -->

### 3.2 Worth it?

<!-- generated:persona-worthit:start -->

How far the change a half-strength Skin Simulation would make stays detectable. A simulation of the picture, not a result for any product. A concern with no targets on a face (see 3 above) has no row.

| Face | Concern | Found | Median (m) | Max (m) | Max, typical observer (m) |
| --- | --- | --- | --- | --- | --- |
| p1a | Under-eye shadows | 2 | 10+ | 10+ | 10+ |
| p1a | Under-eye puffiness | 2 | 10+ | 10+ | 10+ |
| p1a | Fine lines | 93 | 2.2 | 10+ | 7.6 |
| p1a | Redness | 5 | 0.00 | 2.1 | 0.26 |
| p1a | Dark spots | 64 | 1.8 | 9.8 | 6.6 |
| p1a | Pores | 450 | 0.69 | 3.2 | 2.2 |
| p1a | Breakouts | 40 | 1.2 | 8.3 | 5.8 |
| p2b | Under-eye shadows | 2 | 10+ | 10+ | 10+ |
| p2b | Under-eye puffiness | 2 | 10+ | 10+ | 10+ |
| p2b | Fine lines | 188 | 2.6 | 10+ | 8.5 |
| p2b | Dark spots | 89 | 1.9 | 10+ | 6.8 |
| p2b | Pores | 649 | 0.79 | 2.6 | 1.7 |
| p2b | Breakouts | 18 | 1.3 | 4.2 | 2.8 |
| p3a | Under-eye shadows | 3 | 10+ | 10+ | 10+ |
| p3a | Under-eye puffiness | 2 | 10+ | 10+ | 10+ |
| p3a | Fine lines | 207 | 2.3 | 10+ | 7.4 |
| p3a | Redness | 4 | 5.0 | 10+ | 10+ |
| p3a | Dark spots | 194 | 1.4 | 6.9 | 3.9 |
| p3a | Pores | 221 | 0.80 | 2.7 | 1.8 |
| p3a | Breakouts | 5 | 1.5 | 2.4 | 1.6 |
| p5a | Under-eye shadows | 2 | 10+ | 10+ | 10+ |
| p5a | Under-eye puffiness | 2 | 10+ | 10+ | 10+ |
| p5a | Fine lines | 107 | 1.7 | 7.9 | 4.9 |
| p5a | Dark spots | 53 | 0.89 | 4.1 | 2.4 |
| p5a | Pores | 250 | 0.72 | 2.6 | 1.7 |
| p5a | Breakouts | 3 | 1.1 | 2.1 | 1.5 |

Median and max are the one-sided bound over the concern's targets; "10+" is the 10 m contract cap. A median of 0.00 means at least half of the targets show no detectable change even at 0.1 m, the nearest distance the model reports.

**Pores, across a table.** The share of the half-strength change that is still detectable at 1.5 m (bound): `differenceProfile` at 1.5 m, count over the pores found.

| Face | Pores found | Changes detectable at 1.5 m | Share | Farthest change (m) |
| --- | --- | --- | --- | --- |
| p1a | 450 | 38 | 8.4% | 3.2 |
| p2b | 649 | 91 | 14.0% | 2.6 |
| p3a | 221 | 25 | 11.3% | 2.7 |
| p5a | 250 | 11 | 4.4% | 2.6 |
| **All 4 faces** |  |  | **4.4% to 14.0%** |  |

Source: `worthIt` in `lib/vision/worthIt.ts`, with the recorded renders `fixtures/youcam/<face>/renders/sim_improve_a05.png` (under-eye shadows, puffiness, fine lines, redness) and `sim_improve_b05.png` (dark spots, pores, breakouts), `DEFAULT_VIEWING`; the pore share is `differenceProfile[distanceM = 1.5].fraction`. Reproduce: `npx tsx scripts/dev/worthit.ts` (prints the counts at 1.5 m) or `npx tsx scripts/docs/numbers.ts --section persona-worthit` (about 10 s).

<!-- generated:persona-worthit:end -->

### 3.3 The lightest touch: the coverage knee

<!-- generated:persona-coverage:start -->

Foundation `coverageIntensity` with `skin_smooth` at 0, checked on recorded try-on renders (grid 25, 50, 75, 100). The columns are the share of the concern's marks still detectable at 1.5 m (bound). "Least coverage" is the lowest coverage that brings the share to 10% or less; when nothing does, it is the knee, the lowest coverage with 80% of the reduction that 100 gives.

| Face | Concern | Marks | No makeup | Coverage 50 | Coverage 75 | Coverage 100 | Least coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| p1a | Dark spots | 64 | 97% | 83% | 69% | 56% | 100 (knee) |
| p1a | Pores | 450 | 33% | 21% | 17% | 12% | 100 (knee) |
| p1a | Breakouts | 40 | 60% | 38% | 30% | 30% | 75 (knee) |
| p2b | Dark spots | 89 | 99% | 93% | 89% | 84% | 100 (knee) |
| p2b | Pores | 649 | 53% | 33% | 26% | 22% | 75 (knee) |
| p2b | Breakouts | 18 | 72% | 44% | 33% | 28% | 75 (knee) |
| p3a | Dark spots | 194 | 96% | 92% | 82% | 71% | 100 (knee) |
| p3a | Pores | 221 | 37% | 27% | 24% | 21% | 100 (knee) |
| p3a | Breakouts | 5 | 100% | 100% | 40% | 20% | 100 (knee) |

p5a: no makeup renders were recorded, so there is no row. Fine lines, Under-eye shadows, Under-eye puffiness, Redness: no verified makeup lever, so `planCoverage` answers `no_lever` and nothing is searched.

Source: `planCoverage` in `lib/coverage/plan.ts` with `replayMakeupRender` (`lib/coverage/replayRender.ts`) on `fixtures/youcam/<face>/renders/foundation_cov*.png`. Reproduce: `npx tsx scripts/docs/product-tables.ts` (the same search, in docs/EVAL.md) or `npx tsx scripts/docs/numbers.ts --section persona-coverage` (about 30 s).

<!-- generated:persona-coverage:end -->

## 4. The AI comparison

<!-- generated:ai:start -->

Claude Opus 5.5 on Amazon Bedrock (`global.anthropic.claude-opus-5-5`) against our model, on the four demo faces (Test A) and nine synthetic spots (Test B). Every number is in `eval/llm-baseline/results/summary.json`; the full write-up is `eval/llm-baseline/README.md`. `npx tsx eval/llm-baseline/run.ts --offline` rebuilds that file from the cached replies, with no network and no spend.

| Number | Value | Source | Reproduce |
| --- | --- | --- | --- |
| Calls | 65 (Test A 20, Test B 45) | `eval/llm-baseline/results/summary.json` `meta.calls`, `testA.cells`, `testB.patches` | `npx tsx eval/llm-baseline/run.ts --offline` |
| Tokens | 76,790 in, 40,155 out | `eval/llm-baseline/results/summary.json` `meta.tokens` | `npx tsx eval/llm-baseline/run.ts --offline` |
| Estimated cost | $1.11 at list price ($4 in, $20 out per million tokens; Bedrock billing may differ) | `eval/llm-baseline/results/summary.json` `meta.estimatedCostUsd`, `meta.priceAssumptionUsdPerMillion` | `npx tsx eval/llm-baseline/run.ts --offline` |
| Test A (faces): run-to-run CV, median over the cells with a spread | 15% over 19 cells | `eval/llm-baseline/results/summary.json` `testA.aggregate.medianCv` | `npx tsx eval/llm-baseline/run.ts --offline` |
| Test A: run-to-run CV, range over those cells | 0% to 25% | `eval/llm-baseline/results/summary.json` `testA.cells[].llm.cv` | `npx tsx scripts/docs/numbers.ts --section ai` |
| Test A: highest of five answers over the lowest, median and worst cell | 1.4x and 1.7x | `eval/llm-baseline/results/summary.json` `testA.aggregate` | `npx tsx eval/llm-baseline/run.ts --offline` |
| Test B (synthetic spots): geometric-mean error factor of Claude's median answer against our average-observer distance | 1.33x | `eval/llm-baseline/results/summary.json` `testB.aggregate.geometricMeanFactorOfMedianVsNominal` | `npx tsx eval/llm-baseline/run.ts --offline` |
| Test B: the same over every single answer | 1.39x | `eval/llm-baseline/results/summary.json` `testB.aggregate.geometricMeanFactorOfAnswersVsNominal` | `npx tsx eval/llm-baseline/run.ts --offline` |
| Test B: worst median, as a factor | 1.70x | `eval/llm-baseline/results/summary.json` `testB.aggregate.worstFactorOfMedianVsNominal` | `npx tsx eval/llm-baseline/run.ts --offline` |
| Test B: answers inside our average-observer-to-bound range | 23 of 45 | `eval/llm-baseline/results/summary.json` `testB.aggregate.answersInsideModelRange`, `answersTotal` | `npx tsx eval/llm-baseline/run.ts --offline` |
| Test B: run-to-run CV, median over the nine spots | 27% | `eval/llm-baseline/results/summary.json` `testB.aggregate.medianCv` | `npx tsx eval/llm-baseline/run.ts --offline` |
| Test B: run-to-run CV, range over the nine spots | 16% to 36% | `eval/llm-baseline/results/summary.json` `testB.patches[].llm.cv` | `npx tsx scripts/docs/numbers.ts --section ai` |
| Test B: highest of five answers over the lowest, range over the nine spots | 1.4x to 2.1x | `eval/llm-baseline/results/summary.json` `testB.patches[].llm.maxOverMin` | `npx tsx scripts/docs/numbers.ts --section ai` |
| Doubling the spot: Claude's ratio of medians, 1 to 2 mm and 2 to 4 mm, mean over the three contrasts (ideal 2.0) | 1.98 and 1.79 | `eval/llm-baseline/results/summary.json` `testB.aggregate.meanScalingRatio` | `npx tsx eval/llm-baseline/run.ts --offline` |
| Doubling the spot: Claude's ratio of medians, lowest to highest of the six | 1.4x to 2.3x | `eval/llm-baseline/results/summary.json` `testB.scaling[]` | `npx tsx scripts/docs/numbers.ts --section ai` |
| Doubling the spot: single answer pairs, lowest to highest ratio | 1.0x to 4.3x | `eval/llm-baseline/results/summary.json` `testB.scaling[].llm2over1Range`, `llm4over2Range` | `npx tsx scripts/docs/numbers.ts --section ai` |
| Doubling the spot: our model | 2.0 for every doubling, by construction | `eval/llm-baseline/results/summary.json` `testB.scaling[].ours2over1`, `ours4over2` | `npx vitest run eval/llm-baseline` |
| Faces: Claude's median for pores | 0.8 m on all 4 faces | `eval/llm-baseline/results/summary.json` `testA.cells` (concern `pores`) | `npx tsx scripts/docs/numbers.ts --section ai` |
| Faces: our pores still detectable at 1.5 m, bound | p1a, p2b, p3a, p5a: 33%, 53%, 37%, 22% | `eval/llm-baseline/results/summary.json` `testA.cells[].ours.fractionAt1_5m` | `npx tsx scripts/docs/numbers.ts --section ai` |
| Faces: breakouts, Claude answered null in every run | p2b, p3a, p5a (YouCam found 18, 5, 3) | `eval/llm-baseline/results/summary.json` `testA.cells` (concern `breakouts`, `ours.targetCount`) | `npx tsx scripts/docs/numbers.ts --section ai` |
| Our side, run twice in one process | identical (SHA-256 8950a9c3...) | `eval/llm-baseline/results/summary.json` `testA.oursDeterminism` | `npx tsx eval/llm-baseline/run.ts --offline` |

<!-- generated:ai:end -->

## 5. YouCam

<!-- generated:youcam:start -->

| Number | Value | Source | Reproduce |
| --- | --- | --- | --- |
| YouCam products used | 3 (skin-analysis, makeup-vto, skin-simulation) | `runTask(...)` calls in `lib/youcam/client.ts` | `grep -n 'runTask(' -A1 lib/youcam/client.ts` |
| YouCam API endpoints the running app calls | 6: `GET /s2s/v1.0/client/credit`, `POST + GET /s2s/v2.0/task/makeup-vto`, `POST + GET /s2s/v2.0/task/skin-simulation`, `POST + GET /s2s/v2.1/task/skin-analysis`, `POST /s2s/v2.0/file`, `POST /s2s/v2.0/task/delete` | `api(...)` and `runTask(...)` calls in `lib/youcam/client.ts`; every task endpoint is a submit (POST) and a free poll (GET) | `npx tsx scripts/docs/numbers.ts --section youcam`; `grep -n '/s2s/' lib/youcam/client.ts` |
| Free reads used only by scripts (ledger and price list) | 2: `GET /s2s/v1.0/client/credit/history`, `GET /s2s/v2.0/credit/feature-cost` | literal `/s2s/` paths in `scripts/**/*.ts` that the client does not call | `grep -rn '/s2s/' scripts` |
| HD Skin Analysis, units per call | 16 for 8 concerns (tiers 1-4 / 5-8 / 9-12 / 13-16 concerns: 12 / 16 / 20 / 22) | `analysisUnits("hd", HD_ACTIONS.length)` in `lib/youcam/costs.ts` (the price list read from `GET /s2s/v2.0/credit/feature-cost`) | `npx tsx scripts/docs/numbers.ts --section youcam` |
| SD Skin Analysis, units per call (the cheaper fallback) | 12 for 8 concerns | `analysisUnits("sd", SD_ACTIONS.length)` in `lib/youcam/costs.ts` (the price list read from `GET /s2s/v2.0/credit/feature-cost`) | `npx tsx scripts/docs/numbers.ts --section youcam` |
| Skin Simulation, units per call | 6 for 7 concerns in one call (4 for 1-4 concerns) | `simulationUnits` in `lib/youcam/costs.ts` (the price list read from `GET /s2s/v2.0/credit/feature-cost`); the seven concerns are `SIMULATION_GROUPS.all` in `lib/integration/types.ts` | `npx tsx scripts/docs/numbers.ts --section youcam` |
| Makeup VTO, units per call | 1 | `MAKEUP_UNITS` in `lib/youcam/costs.ts` (the price list read from `GET /s2s/v2.0/credit/feature-cost`) | `npx tsx scripts/docs/numbers.ts --section youcam` |
| Units per full live session | 26 (16 analysis + 6 simulation + up to 4 try-on renders at 1); distances alone cost 16 | the three rows above; the renders are `COVERAGE_GRID` in `lib/coverage/plan.ts` | `npx tsx scripts/docs/numbers.ts --section youcam` |
| Measured latency of `POST /api/visibility`, median | 821 ms (min 753, max 877; 5 runs on p2b, 1.4 MB response) | `public/brands/latency.json` (a production build (next start) on the same machine, 2026-10-21) | `npm run build`, then `next start` and `npx tsx scripts/dropin/time-example.ts` (rewrites that file) |

<!-- generated:youcam:end -->

### 5.1 Units spent and left

<!-- generated:ledger:start -->

| Number | Value | Source | Reproduce |
| --- | --- | --- | --- |
| Units at the start | 1,000 | `internal/LEDGER.md` "Starting balance" | `npx tsx scripts/docs/numbers.ts --section ledger` (reads `internal/LEDGER.md`) |
| Units spent in total | 184 | `internal/LEDGER.md` allocation table, Total row | `npx tsx scripts/docs/numbers.ts --section ledger` (reads `internal/LEDGER.md`) |
| Units left | 816 | `internal/LEDGER.md` allocation table, Total row | `npx tsx scripts/docs/numbers.ts --section ledger` (reads `internal/LEDGER.md`) |
| Balance after the last logged call | 816 | `internal/LEDGER.md` spend log, last row | `npx tsx scripts/docs/numbers.ts --section ledger` (reads `internal/LEDGER.md`) |
| Units the first live session through the app spent | 25 (bucket "Integration checks") | `internal/LEDGER.md` allocation table | `npx tsx scripts/docs/numbers.ts --section ledger` (reads `internal/LEDGER.md`) |

| Bucket | Planned | Spent | Left |
| --- | --- | --- | --- |
| Phase 0 spike | 55 | 53 | 2 |
| Demo personas | 90 | 90 | 0 |
| Integration checks | 40 | 25 | 15 |
| Deployed smoke tests | 40 | 0 | 40 |
| Demo video | 40 | 0 | 40 |
| Judges' live sessions | 400 | 0 | 400 |
| Reserve | 335 | 16 | 319 |

Source: `internal/LEDGER.md` (gitignored; the project's own ledger, cross-checked against `GET /s2s/v1.0/client/credit` after each batch). Reproduce: `npx tsx scripts/docs/numbers.ts --section ledger` (reads `internal/LEDGER.md`).

<!-- generated:ledger:end -->

## 6. Engineering

<!-- generated:engineering-misc:start -->

| Number | Value | Source | Reproduce |
| --- | --- | --- | --- |
| YouCam API endpoints called | 6 | `lib/youcam/client.ts` (see section 5) | `npx tsx scripts/docs/numbers.ts --section youcam` |
| Our own API routes | 6 (`/api/visibility`, `/api/youcam/analysis`, `/api/youcam/cleanup`, `/api/youcam/makeup`, `/api/youcam/simulate`, `/api/youcam/status`) | `app/api/**/route.ts` | `find app/api -name route.ts` |
| Axe accessibility scan in the e2e specs | 0 violations asserted on 14 routes: `/`, `/for-brands`, `/how-it-works`, `/privacy`, `/science`, `/self-test`, `/share/p3a`, `/try`, `/try/live`, `/try/not-a-face`, `/try/p1a`, `/try/p2b`, `/try/p3a`, `/try/p5a` | static scan of `tests/e2e/*.spec.ts`: tests that call the axe helper and the pages they `goto` (7 of 7 spec files assert it). The specs require an empty violations list; this table does not record a run | `npx tsx scripts/docs/numbers.ts --section engineering-misc`; `npm run e2e` |

Source lines of TypeScript per `lib/` module (physical lines, as `wc -l` counts them; test files separate).

| Module | Source files | Source lines | Test files | Test lines |
| --- | --- | --- | --- | --- |
| `lib/capture` | 9 | 845 | 3 | 359 |
| `lib/contracts` | 6 | 440 | 0 | 0 |
| `lib/copy` | 11 | 1,551 | 1 | 907 |
| `lib/coverage` | 7 | 571 | 3 | 429 |
| `lib/integration` | 17 | 2,191 | 6 | 541 |
| `lib/scale` | 4 | 345 | 2 | 206 |
| `lib/science` | 11 | 952 | 1 | 370 |
| `lib/selftest` | 4 | 203 | 1 | 85 |
| `lib/skin` | 11 | 2,223 | 5 | 522 |
| `lib/util` | 0 | 0 | 1 | 5 |
| `lib/vision` | 14 | 1,969 | 8 | 844 |
| `lib/youcam` | 17 | 1,845 | 8 | 1,099 |
| **Total** | **111** | **13,135** | **39** | **5,367** |

Source: every `.ts` and `.tsx` file under `lib/` (a test file is one named `*.test.ts`). Reproduce: `find lib/vision -name '*.ts' ! -name '*.test.ts' | xargs cat | wc -l` for one module, or `npx tsx scripts/docs/numbers.ts --section engineering-lines`.

<!-- generated:engineering-misc:end -->

### 6.1 Test counts

<!-- generated:engineering-tests:start -->

| Number | Value | Source | Reproduce |
| --- | --- | --- | --- |
| Unit tests (vitest) | 412 in 44 files | `numTotalTests` of a full `vitest run` (config: `vitest.config.mts`) | `npx vitest run --reporter=json --outputFile=out.json`, then read `numTotalTests`; or `npm test` |
| End-to-end tests (Playwright) | 63 in 7 spec files | Playwright's listing of `tests/e2e/*.spec.ts` (loops expanded); not run here | `npx playwright test --list` |

<!-- generated:engineering-tests:end -->

## 7. Vision constants worth quoting

<!-- generated:vision:start -->

| Number | Value | Source | Reproduce |
| --- | --- | --- | --- |
| A 3 mm disk at 12% contrast, at ModelFest's 30 cd/m^2: typical observer | 3.2 m | `rawDistances` in `lib/vision/visibility.ts` (margin 0); `illustrativeDistances()` in `scripts/docs/eval-tables.ts`; docs/EVAL.md "Illustrative distances" | `npx tsx scripts/docs/numbers.ts --section vision`; `npx vitest run lib/vision/params.doc.test.ts` |
| The same disk, bound (margin 6 dB) | 4.8 m | `rawDistances` (bound), `DEFAULT_MARGIN_DB` | `npx tsx scripts/docs/numbers.ts --section vision` |
| The same disk at the app's default light (45 cd/m^2, indoor): typical and bound | 3.6 m and 5.3 m (the app caps a distance at 10 m) | `rawDistances` with `DEFAULT_VIEWING`; luminance factor is an unverified heuristic (`docs/MODEL.md` limitations) | `npx tsx scripts/docs/numbers.ts --section vision` |
| Safety margin | 6 dB, a factor of 1.995 in contrast sensitivity | `DEFAULT_MARGIN_DB` in `lib/vision/params.ts`; `DEFAULT_VIEWING.marginDb` in `lib/contracts/vision.ts` | `grep -n MARGIN lib/vision/params.ts` |
| What the margin does to a distance: bound over typical, that 3 mm disk | x1.50 | `rawDistances` bound / nominal | `npx tsx scripts/docs/numbers.ts --section vision` |
| Bound over typical, across the seven illustrative features | x1.48 to x1.99 | `illustrativeDistances()` in `scripts/docs/eval-tables.ts`; docs/EVAL.md "Illustrative distances" | `npx tsx scripts/docs/numbers.ts --section vision` |
| 20/20 acuity | 1 arcminute; `acuityScale` 1 = 20/20, 2 = 20/40. 1 arcminute spans 0.29 mm at 1 m | `DEFAULT_VIEWING.acuityScale` in `lib/contracts/vision.ts`; the 1 arcminute is the Snellen definition of 20/20 (manual: textbook definition, not a fitted constant) | `grep -n acuityScale lib/contracts/vision.ts` |
| Default viewing light | 45 cd/m^2 (indoor) | `DEFAULT_VIEWING` in `lib/contracts/vision.ts` | `grep -n DEFAULT_VIEWING lib/contracts/vision.ts` |
| Distances are reported between | 0.1 m and 10 m (shown as "10+") | `MIN_DISTANCE_M`, `MAX_DISTANCE_M` in `lib/contracts/vision.ts` | `grep -n DISTANCE_M lib/contracts/vision.ts` |
| Distances the profile counts at | 0.25, 0.3, 0.6, 1, 1.5, 2.5, 4, 6 m | `PROFILE_DISTANCES_M` in `lib/contracts/vision.ts` | `grep -n PROFILE_DISTANCES_M lib/contracts/vision.ts` |

<!-- generated:vision:end -->

## How this file stays true

<!-- generated:fingerprint:start -->

Slow tables (3.2, 3.3 and 6.1) are not recomputed by `npm test`. Instead `lib/vision/numbers.doc.test.ts` checks two hashes:

- inputs: `4e70197a37199968`. Every file under `lib/`, the `eval/` code, the unit tests, the e2e specs, `fixtures/youcam/` and this script. A change to any of them makes it differ.
- slow tables: `fa0c56ea43472c1b`. The tables above as committed, so a hand edit differs.

When either test fails, run `npx tsx scripts/docs/numbers.ts --write` and commit. `--check` recomputes everything, including the slow tables.

<!-- generated:fingerprint:end -->
