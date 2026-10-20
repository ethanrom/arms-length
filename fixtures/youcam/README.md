# YouCam recorded fixtures

Real responses from the YouCam S2S API, recorded once on 2026-10-20 (the Phase 0 spike, then the persona recording job
that added p1a, the foundation coverage grid and the what-if renders), so that tests and the replay mock never need the
live API. Load them with `lib/youcam/fixtures.ts`.

## Provenance

- The four input photos are **synthetic faces generated in Gemini**. Nobody real is shown.
  - `p1a`: light olive skin with acne, 1080x1610. The raw 848x1264 photo was upscaled 1.274x (Lanczos3, JPEG q95) to a
    1080 px short side; the face already fills about 72% of the width, so there is no crop (`scripts/personas/prepare-input.ts`).
  - `p2b`: deep brown skin, 1080x1341.
  - `p3a`: fair skin, 1080x1575.
  - `p5a`: light East Asian skin with very subtle freckling, the "fine skin" relief example, 1080x1350. The raw 928x1152 photo had the
    face at 55% of the width, so it was cropped to x 102, y 103, 732x915 (face about 70%) and upscaled 1.475x (Lanczos3, JPEG q95)
    (`scripts/personas/prepare-input.ts`). HD analysis only: no renders recorded.
- Everything else is the unedited output of the API for those photos. The JSON is trimmed as described below; the mask and
  render images are byte-identical to what was downloaded, and the inputs are the files that were uploaded.
- Removed on purpose: task ids, file ids, presigned S3 URLs and signatures, the account's storage prefix. No API keys.
  Each URL in the responses was replaced by a path relative to the persona folder.

## Endpoints and versions

| What | Endpoint | Request notes |
|---|---|---|
| Upload | `POST /s2s/v2.0/file` | one JPEG per persona |
| Skin Analysis HD | `POST /s2s/v2.1/task/skin-analysis` | `dst_actions`: `hd_acne`, `hd_age_spot`, `hd_pore`, `hd_wrinkle`, `hd_dark_circle`, `hd_redness`, `hd_eye_bag`, `hd_texture`; `format: "json"` |
| Skin Analysis SD (p2b only) | same endpoint | `dst_actions`: `acne`, `age_spot`, `pore`, `wrinkle`, `dark_circle_v2`, `redness`, `eye_bag`, `texture`; `format: "json"` |
| Makeup VTO (p1a, p2b, p3a) | `POST /s2s/v2.0/task/makeup-vto` | body `version: "1.0"` plus `effects` |
| Skin Simulation (p1a, p2b, p3a) | `POST /s2s/v2.0/task/skin-simulation` | body: concern strengths, 0 to 1 (`spots`, `redness`, `dark_circle`, `acne`) |

Results come from polling `GET /s2s/<same path>/<task_id>`. The persona job (the p1a analysis, the new grid renders and the
what-ifs) was run by `scripts/personas/record.ts` and packaged by `scripts/personas/package.ts`.

## Layout

```
p2b/
  input.jpg                      the photo that was analysed
  analysis.hd.json               HD run: the raw `data` object of the task result
  analysis.sd.json               SD run, same shape
  masks/hd/<type>[_<region>].png HD masks (17), named after the API `type` and `region` fields
  masks/sd/<type>.png            SD masks (8)
  renders/<label>.png            makeup-vto results
  renders/<label>.request.json   the request body that produced it (effects only, no file id)
p3a/
  input.jpg, analysis.hd.json, masks/hd/*.png, scale.json
  renders/                       foundation grid + simulation, as for p2b
p1a/
  input.jpg, analysis.hd.json, masks/hd/*.png (17), scale.json
  renders/                       foundation grid + simulation
p5a/
  input.jpg, analysis.hd.json, masks/hd/*.png (17), scale.json   (no renders)
<persona>/renders/offsets.json   measured alignment of each render to input.jpg (see quirk 8)
```

### Renders

**Foundation coverage grid** (`foundation_cov<N>.png`): `coverageIntensity` N, `colorIntensity` 50, `glowIntensity` 0, preceded by
`skin_smooth` 0/0 so the render is local: no global brightening, and a zero-coverage render would be the input itself (free).
The replay picks the nearest `coverageIntensity` among these.

| Persona | Foundation `coverageIntensity` | Shade | What-if (simulation) |
|---|---|---|---|
| p1a | 25, 50, 75, 100 | `#e3b499` | `sim_acne05_redness05.png`: acne 0.5, redness 0.5 |
| p2b | 25, 50, 75, 100 | `#8a5840` | `sim_dark_circle05.png`: dark_circle 0.5 |
| p3a | 25, 50, 75, 100 | `#e6af9d` | `sim_spots05_redness05.png`: spots 0.5, redness 0.5 (Phase 0) |

Shade: the mean sRGB colour of cheek patches away from features (`scripts/personas/shade.ts`; patches and values in
`scripts/personas/shades.json`). p1a and p3a pool one 80 px patch per cheek, leaving out pixels within 4 px of an age spot, acne,
dark circle, eye bag or wrinkle line. p2b keeps its Phase 0 value (one 40 px patch at (300, 820)) so the new renders match the
two spike renders. `p2b/renders/foundation_cov50.png` and `foundation_cov100.png` are the spike's `lv_found_c50` and
`lv_found_c100` (same request, copied byte for byte).

**Phase 0 renders with default smoothing.** These five p2b renders were made before `skin_smooth` 0/0 was known to matter. They carry
the default smoothing and a +23% global brightening, so they are not comparable with the grid above.

| File | Request |
|---|---|
| `p2b/renders/mu_concealer_cov20.png` | concealer, `coverageLevel` 20 |
| `p2b/renders/mu_concealer_cov50.png` | concealer, `coverageLevel` 50 |
| `p2b/renders/mu_concealer_cov90.png` | concealer, `coverageLevel` 90 |
| `p2b/renders/mu_foundation_cov30.png` | foundation, `coverageIntensity` 30 |
| `p2b/renders/mu_foundation_cov80.png` | foundation, `coverageIntensity` 80 |

Their requests use shade `#8a5840`, `colorIntensity` 50 (concealer also `colorUnderEyeIntensity` 50, foundation `glowIntensity` 0) and
have no `skin_smooth` effect. Every `*.request.json` is the body that was sent minus the file id: `{ version, effects }` for makeup,
the concern strengths for a simulation.

## analysis.*.json

`{ error, results: { output: [...] }, task_status }`. Each output item is
`{ type, region?, raw_score, ui_score, mask_urls: [path], url: null }`, plus three extra items: `all` and `skin_age`
(`{ type, score, url }`, no masks) and `resize_image` (the analysed image). `mask_urls[0]` is a path relative to the
persona folder, for example `masks/hd/hd_pore_whole.png`. For `resize_image` the API returned the input re-encoded
(mean absolute luminance difference 0.045/255), so it points at `input.jpg` and the re-encode is not stored.

## Known quirks (details in `internal/research/spike.md` section 8)

1. **Parse ids bigint-safe, and expect scores as strings.** Some ids in the credit endpoints exceed 2^53. The recorder used
   `json-bigint` with `storeAsString`, which turned any numeric literal longer than 15 characters into a string, so
   `raw_score` is `"52.43487358093262"` in some items and `100` in others. The API itself sends numbers. The files keep the
   recorded form on purpose; `loadFixtureAnalysis` coerces with `Number()`.
2. **HD masks have a baked dark layer.** Most HD masks carry an RGB (61,61,61) layer at a fixed per-concern alpha covering
   97 to 100% of the image (pore 102, acne 92, age spot and redness 51). The modal alpha is the background; the information
   is whatever differs from it (drawn marks and transparent cut-outs). Region masks (dark circle, eye bag, whole-face
   wrinkle) and all SD masks have a transparent background instead.
3. **Pores and acne are fixed-size markers.** Pores are about 7 px dots and acne is 17 px rings. They give locations, not
   sizes. Age spots (closed contours) and wrinkles (3 px polylines) carry real extent.
4. **Masks match the photo** (same size, aligned to within about 1 px). They are exactly 1080x1341 for p2b, 1080x1575 for p3a and 1080x1610 for p1a.
5. **Makeup VTO output can be shifted, and is brightened unless smoothing is off.** For p2b the result is 1080x1340 (one row
   short) and out(x, y+1) = in(x, y), a +1 px vertical shift; other photos differ (quirk 8), so register each render rather than
   hardcoding it. With smoothing on, the whole image, background included, is about
   +23% brighter in linear luminance, so never compare absolute luminance between input and render. The result is an RGBA
   PNG with a fully opaque alpha channel even though the URL ended in `.jpg`. Where no `skin_smooth` effect was sent (the five
   Phase 0 renders), the default smoothing (50) is applied; the grid renders send `skin_smooth` 0/0 and have neither the smoothing
   nor the brightening.
6. **Concealer `coverageLevel` barely changes the render** (20 vs 90 differ by 0.03/255 on average); foundation
   `coverageIntensity` does respond. The simulation is pixel-aligned (same size as the input) and only edits flagged regions.
7. **Empty or zero results are real.** The p2b redness mask is empty (one alpha value) and `hd_pore_forehead` has
   `raw_score` 0 on p2b while dense pore marks sit on that forehead. SD redness on p2b is fully transparent.
8. **VTO output geometry differs per photo; use `renders/offsets.json`.** Each render was registered against its `input.jpg`
   (`scripts/personas/register-check.ts`; convention out(x + dx, y + dy) = in(x, y)):
   - p2b: 1080x1340, `dy` +1, black first row (the Phase 0 finding).
   - p3a: **1078x1576, `dx` -3, `dy` 0**, black last row and last column. The engine dropped 3 columns on the left.
   - p1a: 1080x1610, `dx` 0, `dy` 0, no padding: the same size and no shift.
   The output size alone does not give the shift, so a size heuristic is wrong for p3a and p1a. Within a persona every render has
   the same geometry (sd 0.03 to 0.15 px, NCC at least 0.86). Simulations are pixel-aligned (dx, dy within 0.03 px) for all three.
9. **Not recorded:** an SD run for p3a, p1a and p5a; any render for p5a; concealer for p3a and p1a; simulations other than the three above; foundation
   below 25 (a skin_smooth 0/0 render without makeup is the input itself).

## Size

About 40 MiB in total: renders 34.8 MiB (a VTO render is 1.6 to 1.8 MiB, a simulation 2.0 MiB), HD masks 4.7 MiB for four
personas, SD masks 0.5 MiB, inputs 1.5 MiB, JSON 30 KB. The largest mask is 213 KB, so no mask was re-encoded. The renders
were left byte-identical: palette quantisation would change pixel values, and a lossless re-encode saved little (none for VTO,
about 24% for the simulation).

## scale.json (per persona)
Iris-ruler scale for the analysed frame (`input.jpg`), computed by `scripts/scale/fixtures.ts` (`npx tsx scripts/scale/fixtures.ts p1a`
for one persona) with MediaPipe Face Landmarker in headless Chrome. mm per px: p1a 0.1630, p2b 0.1699, p3a 0.1757, p5a 0.1754. Fields are the `ScaleEstimate` contract (`mmPerPx`, `relSd`, `source: "iris"`, `irisPx`)
plus diagnostics. `mmPerPx` applies to the analysed (resized) frame, not the original photo.
