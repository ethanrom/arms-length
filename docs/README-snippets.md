# README snippets

Short sections to paste into the main README. Each one is self-contained.

## Headline results

Numbers with their sources: [`docs/EVAL.md`](EVAL.md) and [`docs/MODEL.md`](MODEL.md).

- **The vision model matches human data.** It uses the published Watson & Ahumada (2005) Standard A constants unchanged, and
  reproduces the ModelFest observers' thresholds to **0.69 dB RMS** over 41 test patterns (0.78 dB over the 8 shaped like skin
  features; the paper's own figure is 1.03 dB over all 43). Every distance is a one-sided bound with a 6 dB safety margin.
- **Shares, not outliers.** For pores, spots, lines and breakouts we say "about a third of your dark spots can be seen across a
  table" for a typical sharp-eyed person, and "even perfect eyes couldn't pick out your pores past 40 cm" for the one-sided
  bound, because the farthest single mark is decided by one outlier. Exact counts live in the receipt.
- **Better than asking an AI, but not by being cleverer about the recipe.** In 65 real calls ($1.11), Claude Opus 5.5 via
  Amazon Bedrock landed a typical 1.3x from our distance when told a spot's size and contrast. But it gave a different number
  each time (run-to-run spread 27%, median), its answers roughly doubled with the spot on average (1.98x and 1.79x) but single
  pairs of answers ranged from 1.0x to 4.3x, only 23 of 45 answers fell inside our range, it said 0.8 m for pores on every
  face, and it answered "null" for breakouts on three faces where YouCam found 18, 5 and 3. We measure the inputs per face,
  give identical results every run, and double exactly when the spot doubles.
- **"Worth it?" asks whether a change would show.** The visibility of the difference a half-strength YouCam Skin Simulation
  would make, a simulation of the picture and not a result for any product: **pores, a small change** (at most 4% to 14% of
  pores change visibly across a table, none beyond 4 m); **under-eye, a large soft area** that shows even a small change from
  far (detectable at our 10 m cap on every recorded face).
- **The lightest touch, checked on a virtual try-on.** Foundation `coverageIntensity` with `skin_smooth` at 0 takes the share of pores
  detectable across a table from 53% to 22% on one face; we report the knee (the lowest coverage with 80% of the effect), and
  say plainly that dark circles have no makeup lever.
- **A drop-in layer.** `POST /api/visibility` takes any YouCam Skin Analysis result and its photo, estimates the scale from the masks
  (0.1% to 4.8% from the iris ruler on the four recorded faces), and spends no units.

## YouCam API

Arm's Length is built on three YouCam APIs, all called from the server. Full detail: [`docs/YOUCAM.md`](YOUCAM.md).

- **HD Skin Analysis v2.1** (`POST /s2s/v2.1/task/skin-analysis`, 16 units) finds the features: eight HD concerns, 17 masks, JSON
  output. We measure each one in millimetres (the iris is the ruler) and in contrast, then turn that into a visibility distance.
- **Makeup VTO** (`makeup-vto`, 1 unit) is the "lightest touch" lever. Foundation `coverageIntensity` with `skin_smooth` at 0
  lowered median spot contrast by 30% at coverage 50 and 45% at 100, and a no-makeup render is identical to the input.
- **Skin Simulation** (`skin-simulation`, 4 units) is the "what if". It edits only the flagged regions and stays pixel-aligned
  with the photo, so the difference from the photo can be measured on the same masks. At half strength it drives "Worth it?"
  (strength 1.0 beautifies beyond natural, so we do not use it).
- **Account endpoints** (`client/credit`, `client/credit/history`, `credit/feature-cost`) keep the unit ledger honest: the
  balance gates every live call, and the price list and history were used to build and check the cost table.
- **Notes for other developers:** HD masks carry a baked-in dark layer (read the most common alpha as the background), a makeup
  render is shifted by an amount that differs per photo (one row on one face, three columns on another, none on a third), so
  register every render; a submit that fails on the network may still be charged (never auto-retry it), and ids can exceed 2^53.
- **Free to try, safe on a budget:** the demo faces replay real recorded YouCam output with no keys. Live mode needs an access
  code and is limited by daily caps, a 100-unit floor and a kill switch. 1,000 units cover the whole project, judging included.
