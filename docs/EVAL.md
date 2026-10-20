# How we check the model

Arm's Length makes one kind of claim: *beyond this distance, the feature is invisible even to an ideal observer.* This
page shows what backs that claim, in the order a sceptical reader would ask. How the model works is in
[MODEL.md](MODEL.md).

| Question | Answer | Where |
|---|---|---|
| Does the vision model match real people's measurements? | Yes for the shapes we use: 0.69 dB RMS over 41 published test patterns, 0.78 dB over the 8 that look like skin features | [1](#1-modelfest-human-data) |
| Does the measuring stage recover the size and contrast of a feature? | Yes on planted features: sizes within 2% (a wrinkle's length within 5%), contrasts within 0.002 | [2](#2-synthetic-skin-oracles) |
| Do the numbers behave sensibly? | Distances grow with size, contrast and margin; the lookup tables match direct computation | [3](#3-properties-the-tests-enforce) |
| What does it say for typical features? | Table of nominal and bound distances | [4](#4-illustrative-distances) |
| Can I check one prediction myself? | The walk-back self-test | [5](#5-check-one-prediction-yourself) |
| Is it better than asking an AI? | Head-to-head pending | [6](#6-why-not-just-ask-an-ai) |

**What is not validated yet:** there is no human study of distances for real skin features (ModelFest used calibrated
test patterns on a display), the demo faces are synthetic, and YouCam's repeatability on the same photo has not been
measured. [MODEL.md](MODEL.md#limitations) lists the limits of the claim.

## 1. ModelFest: human data

### What it is

ModelFest is a public data set from a consortium of vision laboratories. Sixteen observers in ten labs were shown 43
test patterns, each faded until it was only just visible, and the contrast at that point (the *threshold*) was recorded.
It exists so that models of human vision can be tested against the same measurements. Its patterns include the shapes
that matter to us: soft Gaussian blobs (pores and small spots), a uniform disk (a spot), a very thin line and a narrow
pair of lines (wrinkles), and an edge (the border of a region). Watson & Ahumada (2005) fitted the *standard model* that
we use to these 43 thresholds. Their constants are the ones we ship.

### How we run it

`eval/modelfest/` generates each pattern from its published definition at unit contrast (no image files are needed),
asks the same detector code that powers the app for the contrast at which it just detects the pattern (bisection on
contrast), and compares that with the observers' mean threshold. Thresholds are in dB, `20 log10(contrast)`; **error =
predicted - observed**, so a positive error means the model needs more contrast than the observers did (it under-predicts
visibility). Nothing is tuned on this data: the model's constants are the paper's.

### Results

Standard A, ModelFest's own lighting (30 cd/m^2), no safety margin:

- **RMS error 0.69 dB over the 41 patterns we can generate.**
- **RMS error 0.78 dB over the 8 skin-relevant shapes** (four Gaussian blobs, the disk, the line, the dipole, the edge).
- For scale: individual observers differ from the observer mean by 3.46 dB RMS, and the most sensitive of the 16 sits
  4.2 dB below it. An error of under 1 dB against the mean is well inside the difference between people.

<!-- generated:modelfest-families:start -->

| Family | Stimuli (#) | n | RMS error (dB) | Bias (dB) | Largest error (dB) |
| --- | --- | --- | --- | --- | --- |
| Gaussian blobs (pores, small spots) | 26-29 | 4 | 0.18 | +0.02 | +0.31 (#29) |
| Disk (a spot) | 40 | 1 | 0.45 | -0.45 | -0.45 (#40) |
| Thin line and dipole (wrinkles) | 31-32 | 2 | 1.45 | +0.66 | +1.95 (#31) |
| Edge (border of a region) | 30 | 1 | 0.57 | +0.57 | +0.57 (#30) |
| Gabor patches: fixed size, fixed cycles, oriented | 1-14, 36-37 | 16 | 0.63 | +0.26 | +1.63 (#4) |
| Elongated Gabors and baguettes | 15-21 | 7 | 0.62 | +0.41 | +1.10 (#15) |
| Compound Gabors, collinear strings, plaids | 22-25, 33-34, 38-39 | 8 | 0.76 | 0.00 | -1.39 (#38) |
| Bessel and checkerboard patterns | 41-42 | 2 | 0.70 | -0.70 | -0.78 (#41) |
| **All analytic stimuli** | 1-34, 36-42 | 41 | 0.69 | +0.17 | +1.95 (#31) |
| **Skin-relevant shapes only** | 26-32, 40 | 8 | 0.78 | +0.19 | +1.95 (#31) |

<!-- generated:modelfest-families:end -->

The eight skin-relevant shapes, one by one:

<!-- generated:modelfest-skin:start -->

| # | Stimulus | Looks like | Observed (dB) | Predicted (dB) | Error (dB) |
| --- | --- | --- | --- | --- | --- |
| 26 | Gaussian sd 30 arcmin | a broad soft patch (dark circle scale) | -32.73 | -32.86 | -0.13 |
| 27 | Gaussian sd 8.43 arcmin | a soft spot | -30.52 | -30.63 | -0.11 |
| 28 | Gaussian sd 2.106 arcmin | a small spot | -24.17 | -24.15 | +0.02 |
| 29 | Gaussian sd 1.05 arcmin | a pore or the smallest spot | -16.61 | -16.30 | +0.31 |
| 30 | Edge x Gaussian | the border of a region | -38.72 | -38.15 | +0.57 |
| 31 | Line 0.5 arcmin x Gaussian | a fine wrinkle | -18.68 | -16.73 | +1.95 |
| 32 | Dipole 3 px x Gaussian | a wrinkle with a highlight beside it | -12.51 | -13.14 | -0.63 |
| 40 | Disk 0.25 deg diameter | an age spot or freckle | -32.53 | -32.98 | -0.45 |

<!-- generated:modelfest-skin:end -->

![ModelFest: predicted against observed thresholds, one point per stimulus](../eval/results/modelfest.svg)

*Each point is one test pattern. The horizontal position is what the observers needed; the vertical position is what the
model predicts. On the diagonal is a perfect prediction; above it the model needs more contrast than people did. The data
behind every point is in `eval/results/modelfest.json`.*

**Where it is least accurate.** The skin-relevant shape the model under-predicts most is the thinnest line (#31, +1.95
dB): real observers were somewhat better at spotting a hairline than the model. That is the direction that would make a
distance too short, and it is why the safety margin (6 dB) is larger than any single error here. The largest errors elsewhere
are a 4 cycles/deg Gabor (+1.63 dB) and a plaid (-1.39 dB).

### Comparison with the paper, and why our set is 41

| | Stimuli | RMS error |
|---|---|---|
| Watson & Ahumada 2005, Standard A (paper, Table 5) | 43 | 1.03 dB |
| This repository, Standard A, all analytic patterns | 41 | 0.69 dB |
| This repository, the 8 skin-relevant shapes | 8 | 0.78 dB |
| This repository's 41 plus the two excluded patterns, at the errors measured with the original images | 43 | 1.03 dB |

The paper's 1.03 dB covers all 43 patterns. We can regenerate 41 of them, because two are not defined by a formula:

| # | Pattern | Why we cannot regenerate it | Model error on the original images |
|---|---|---|---|
| 35 | Binary noise, 1 arcmin samples | One particular random draw | -4.22 dB |
| 43 | Natural scene (a photograph of a city) | A photograph | -2.93 dB |

To use them we would have to ship the stimulus images, and the data set states no licence, so we ship only our own table
of 43 observer means. The errors in the last column come from a separate replication on the original images, run outside
this repository. Putting them back reproduces the paper:
`sqrt((41 x 0.688^2 + 4.22^2 + 2.93^2) / 43) = 1.03 dB`. So the 0.69 dB is *not* a better model than the paper's; it is the
same model scored without its two hardest cases.

**Which way do the excluded errors point?** Both are negative: the model says noise and a busy natural scene are *easier*
to see than observers found them. For a claim of the form "invisible beyond d" that is the cautious direction (the model
over-states how far they carry), and textured skin is plausibly closer to noise and a natural scene than to clean blobs.
Among the skin-relevant shapes the model under-predicts visibility by at most 1.95 dB (the thin line), and the 6 dB
margin covers that.

### Data provenance

- `eval/modelfest/thresholds.json` holds 43 observer means (and the spread across observers) derived from the
  ModelFest baseline data (16 observers x 43 stimuli x 4 repeats). The source file is identified by its SHA-256 in that
  file. The values in the file are log sensitivity; the table above is in dB (`-20 x value`).
- Where the paper's Table 1 and the released images disagree, we followed the images (for example, Table 1 prints a Gabor
  envelope of 0.05 deg where the images and the consortium's own table give 0.5 deg). The differences are listed at the top
  of `eval/modelfest/stimuli.ts` and were checked pixel by pixel with `scripts/eval/check-stimuli.ts` against a local copy.
- The harness also contains a *stand-in* detector with a cruder sensitivity curve that was tuned on these same thresholds
  (about 2 dB RMS). It exists so the harness runs without the model; its numbers are not validation, and the default
  command uses it. Always pass `--detector=standard`.

## 2. Synthetic skin oracles

An oracle is a case where we know the right answer because we drew it. We build a skin-coloured photo (about 1%
pixel noise) and a YouCam-style mask with planted features of known size and contrast, run the real measuring code
(`measureAnalysis`), and check that it recovers what we planted. The scale is 0.2 mm per pixel. Sizes are in
millimetres, contrasts are Weber contrast in linear light.

| Case | Planted | Recovered at the time of writing | The test requires |
|---|---|---|---|
| Age spot (outline drawn with a darker neighbour inside its ring) | 4.0 mm, contrast -0.25 | 4.02 mm, -0.250 | within 0.2 mm and 0.03 |
| The neighbouring darker spot | 2.8 mm, -0.60 | 2.75 mm, -0.600 | within 0.2 mm and 0.04 |
| Wrinkle (mask drawn 2 px off the crease) | 16 mm long, 0.6 mm wide, -0.30 | 15.2 mm, 0.602 mm, -0.301 | length 94-103% of planted, width within 0.15 mm, contrast within 0.05 |
| Pore marker (5 px dot) | 1.0 mm, -0.40 | 0.998 mm, -0.402 | within 0.3 mm and 0.05; size source "photo" |
| Pore marker on flat skin | nothing | prior of 0.4 mm, flagged "prior" | prior, at least 0.3 mm |
| Acne marker (red lesion) | red-green 0.1380, luminance -0.1721, from the colour maths | 0.1380, -0.1721 | within 0.03 and 0.04 |
| Dark circle (80 x 40 px region) | 16 x 8 mm, -0.30 against the cheek band | 16.0 x 8.0 mm, -0.2997 | exact size, contrast within 0.02 |
| Redness zone | red-green 0.0850, luminance -0.0743 | 0.0850, -0.0743 | within 0.02 and 0.03; reference "skin outside zones" |

The wrinkle's length comes out about 5% short (the skeleton loses a pixel or two at each end); the line threshold depends
only weakly on length, and the tolerance is written into the test. An empty redness mask is reported as skipped ("no
redness zones were found"), not as a zero.

Other checks of the measuring stage (`lib/skin`, `lib/scale`):

- **Mask decoding.** A mask with a baked dark layer at alpha 51, a drawn outline and a transparent interior gives one
  component by the modal-alpha rule (where "alpha above 0" would give the whole frame); a single-alpha mask has no
  foreground. Holes fill up to a cap; components are 8-connected; a plain 80 x 3 px stroke has a skeleton length within
  94-102% of 80 and a distance-transform width of exactly 3 px.
- **Colour maths.** sRGB code 128 decodes to 0.2158605 (IEC 61966-2-1); white maps to equal cone signals, so neutral greys
  have zero red-green contrast; a redder patch has positive red-green contrast and a swapped pair has the opposite sign.
- **Scale.** The iris ruler gives `11.71 / iris px`; its uncertainty is the population spread and the landmark error in
  quadrature (3.7% for a 100 px iris), larger for a small iris or one eye; a card held flat is recovered at any rotation
  with under 1% uncertainty, a tilted card widens it, a non-card shape is rejected, and the card is at least four times
  more certain than the iris. The committed demo-face scales satisfy `mm/px x iris px = 11.71` and a plausible
  interpupillary distance.
- **Recorded analyses.** Real YouCam output for the two synthetic demo faces replays offline (the tests never call the
  live API; the ranges are in `lib/skin/fixtures.test.ts`). On the deep-skin face: 80-100 age spots (YouCam drew 89), 10-25 acne markers (15), at least 190 pores
  (201 dots), 120-229 wrinkle lines, two dark circles, two eye bags, and the empty redness mask is skipped. On the other
  face: 180-205 age spots (194), 5-12 acne markers (7), at least 170 pores (184) and two or more redness zones, all with
  positive red-green contrast. Every contrast is finite and every size positive.

## 3. Properties the tests enforce

Only where a silent bug would break the claim (`npm test` runs all of them):

- **Reproducing the published model.** The five analytic ModelFest patterns (#26-29 and #40) agree with an independent
  numpy implementation to 0.1 dB, both computed directly and through the lookup tables; the CSF peaks are 217.3 at 3.45
  cycles/deg (Standard A) and 289.0 at 3.62 (B), as published; the image-domain FFT route agrees with the closed-form route.
- **The tables are the model.** Lookups equal direct computation off the grid (0.05 dB for blobs, 0.1 dB for lines), thresholds
  never fall as a feature gets smaller, and a finite line converges to the infinite line.
- **Distances behave.** A distance does not decrease with size, contrast or margin (checked at several points each); at fixed contrast it scales exactly with
  size (2.5 times the size gives 2.5 times the distance); the bound is never below the nominal distance; a dim room shortens
  the nominal distance but not the bound; a red-green contrast never shortens a distance; non-chromatic concerns ignore it.
- **The detector and the numbers agree.** The detector's response is 1 at the nominal distance of a 3 mm, 12% disk
  (3.234 m), ignores the margin, and falls with distance.
- **castleCSF port.** Rows of castleCSF's own data files equal a reference port to 1e-4 in log10 and lie within 4 dB (Gabors)
  and 3.5 dB (discs) of the measurements; the disc rule is continuous at 0.083 deg and falls as `r^2` below it.
- **The picture.** The renderer returns an image of the same size with alpha kept, is deterministic, is almost the identity
  at 10 cm, removes fine detail with distance while keeping a large soft patch, and renders a 512 px photo in under a second.
- **The docs.** The parameter tables in MODEL.md and the tables in this file are regenerated by script and compared with the
  code in `lib/vision/params.doc.test.ts`; the copy linter checks both pages for banned words.

## 4. Illustrative distances

Each row is a feature we plant and ask the model about, with luminance contrast only. "Nominal" is the distance for an
average observer; "bound" adds the 6 dB margin. Both columns are at ModelFest's 30 cd/m^2, where the luminance factor is exactly
1, so the numbers come from Standard A and nothing else. The last column is what the app reports at its default indoor
setting (45 cd/m^2, capped at 10 m).

<!-- generated:distances:start -->

| Feature | Shape and size | Contrast | Nominal (average observer) | Bound (+6 dB) | Bound in the app (indoor, 45 cd/m^2) |
| --- | --- | --- | --- | --- | --- |
| Age spot | 3 mm disk | 12% | 3.2 m | 4.8 m | 5.3 m |
| Pore, sharp and strong | Gaussian, sd 0.12 mm (0.28 mm wide) | 30% | 0.60 m | 0.88 m | 0.96 m |
| Pore, as a phone photo usually measures it | Gaussian, 0.3 mm wide | 5% | 0.17 m | 0.31 m | 0.35 m |
| Spot | 4 mm disk | 10% | 3.8 m | 5.8 m | 6.4 m |
| Freckle | 2 mm disk | 15% | 2.5 m | 3.7 m | 4.0 m |
| Papule | 5 mm disk | 15% | 6.2 m | 9.1 m | 10+ m |

<!-- generated:distances:end -->

Reading it: a 3 mm spot of 12% contrast is just visible to an average observer at 3.2 m, and not at all beyond 4.8 m even
for a sharp one. A pore as a phone photo usually measures it (0.3 mm wide, diluted to 5% contrast) is out of reach of
anyone but a very close viewer: its bound is about the length of a selfie. A sharp, strong pore (30% contrast) carries to
just under 1 m. The same rules produce the nominal and bound values the app shows, and the Step-back picture applies the
same thresholds.

## 5. Check one prediction yourself

The walk-back self-test (`lib/selftest`) turns the model into something anyone can try. Hold a bank card against the
screen to calibrate millimetres per pixel; the screen then draws a disk of a chosen size and Weber contrast on a mid-grey
background (a gamma of 2.2 is assumed); the model predicts the distance at which it should vanish, nominal and bound,
for an assumed screen luminance of 100 cd/m^2; then you walk back until it disappears and the result is compared with the band.

How to read it: vanishing *before* the nominal distance is normal for a real viewer in a real room, because the bound is
one-sided. Vanishing between nominal and bound fits the model. Still seeing the disk *beyond* the bound would contradict
the model (or the screen assumptions) and is reported as such, not hidden. It is a demonstration, not a lab study: the
screen's true luminance is unknown.

## 6. Why not just ask an AI?

**Status: head-to-head pending. This section is an outline; there are no results yet and none are implied.**

*The question.* A general-purpose vision language model will give a sensible generic answer to "from how far can people
see this?" ("pores usually are not visible at conversation distance"). Is that a substitute for measuring?

*Planned design.*

1. **Stimuli.** Synthetic skin patches with planted features of known size and contrast, and the three demo personas.
   For the planted features the reference distances are the model's own nominal and bound values, which are exact for a
   planted feature.
2. **Ask.** Show the same image and the same prompt to a vision language model, five times each, and ask from how far each
   marked feature stops being visible. No tools, no hints about the method.
3. **Measure.** Error against the reference as a ratio (log scale); run-to-run spread over the five answers; whether the
   ranking of features by distance is stable. Arm's Length has zero spread by construction: same photo, same numbers.
4. **Report.** One chart and a short table in the README and the submission text, with the cost of the calls.

*What it can and cannot show.* It tests whether an AI reproduces a number our model computes, so it speaks to repeatability,
specificity (numbers pinned to exact locations) and the audit trail, not to whether the number is physically right. That
rests on the ModelFest comparison above and the walk-back test. Each distance in the app opens a chain of receipts: YouCam
found it here, it is X mm wide (iris ruler), it has Y% contrast, so at d it subtends Z arcmin and needs T% contrast.

*To do:* the stimuli generator, the prompt and the scoring script; the run (a few dollars of model calls, no YouCam units);
the chart.

## 7. Reproduce

```bash
npm ci
npx tsx eval/run.ts --detector=standard     # about 10 s; rewrites eval/results/modelfest.json and modelfest.svg
npm test                                    # all the checks above, offline (recorded YouCam responses only)

npx tsx scripts/vision/build-tables.ts --check    # rebuild the lookup tables and report the difference
npx tsx scripts/docs/eval-tables.ts --write       # refresh the generated tables in this file
npx tsx scripts/docs/params-table.ts --write      # refresh the generated tables in MODEL.md
```

`npm run eval -- --detector=standard` does the same as the first command. Running without `--detector=standard` uses the
stand-in detector described above, which is not the product model. The output is deterministic: running it again leaves
the committed files unchanged.
