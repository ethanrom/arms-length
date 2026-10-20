# README snippets

Short sections to paste into the main README. Each one is self-contained.

## YouCam API

Arm's Length is built on three YouCam APIs, all called from the server. Full detail: [`docs/YOUCAM.md`](YOUCAM.md).

- **HD Skin Analysis v2.1** (`POST /s2s/v2.1/task/skin-analysis`, 16 units) finds the features: eight HD concerns, 17 masks, JSON
  output. We measure each one in millimetres (the iris is the ruler) and in contrast, then turn that into a visibility distance.
- **Makeup VTO** (`makeup-vto`, 1 unit) is the "least makeup" lever. Foundation `coverageIntensity` with `skin_smooth` at 0
  lowered median spot contrast by 30% at coverage 50 and 45% at 100, and a no-makeup render is identical to the input.
- **Skin Simulation** (`skin-simulation`, 4 units) is the "what if". It edits only the flagged regions and stays pixel-aligned
  with the photo, so the result can be re-measured on the same masks.
- **Account endpoints** (`client/credit`, `client/credit/history`, `credit/feature-cost`) keep the unit ledger honest: the
  balance gates every live call, and the price list and history were used to build and check the cost table.
- **Notes for other developers:** HD masks carry a baked-in dark layer (read the most common alpha as the background), the
  makeup render is shifted one row, a submit that fails on the network may still be charged (never auto-retry it), and ids can
  exceed 2^53.
- **Free to try, safe on a budget:** the demo faces replay real recorded YouCam output with no keys. Live mode needs an access
  code and is limited by daily caps, a 100-unit floor and a kill switch. 1,000 units cover the whole project, judging included.
