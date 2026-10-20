# YouCam recorded fixtures

Real responses from the YouCam S2S API, recorded once on 2026-10-20 during the Phase 0 spike, so that tests and the
replay mock never need the live API. Load them with `lib/youcam/fixtures.ts`.

## Provenance

- The two input photos are **synthetic faces generated in Gemini**. Nobody real is shown.
  - `p2b`: deep brown skin, 1080x1341.
  - `p3a`: a second synthetic face, 1080x1575.
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
| Makeup VTO (p2b only) | `POST /s2s/v2.0/task/makeup-vto` | body `version: "1.0"` plus `effects` |
| Skin Simulation (p3a only) | `POST /s2s/v2.0/task/skin-simulation` | body `spots`, `redness` (0 to 1) |

Results come from polling `GET /s2s/<same path>/<task_id>`.

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
  input.jpg, analysis.hd.json, masks/hd/*.png
  renders/sim_spots05_redness05.png (+ .request.json)   skin-simulation result
```

Renders packaged (everything that existed in the spike data at packaging time):

| File | Request |
|---|---|
| `p2b/renders/mu_concealer_cov20.png` | concealer, `coverageLevel` 20 |
| `p2b/renders/mu_concealer_cov50.png` | concealer, `coverageLevel` 50 |
| `p2b/renders/mu_concealer_cov90.png` | concealer, `coverageLevel` 90 |
| `p2b/renders/mu_foundation_cov30.png` | foundation, `coverageIntensity` 30 |
| `p2b/renders/mu_foundation_cov80.png` | foundation, `coverageIntensity` 80 |
| `p3a/renders/sim_spots05_redness05.png` | simulation, spots 0.5, redness 0.5 |

All concealer and foundation requests use shade `#8a5840`, `colorIntensity` 50 (concealer also `colorUnderEyeIntensity` 50,
foundation `glowIntensity` 0). No `skin_smooth` effect was sent (see the quirks).

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
4. **Masks match the photo** (same size, aligned to within about 1 px). They are exactly 1080x1341 for p2b and 1080x1575 for p3a.
5. **Makeup VTO output is shifted and brightened.** The result is 1080x1340 (one row short), and out(x, y+1) = in(x, y), a
   +1 px vertical shift; register each render rather than hardcoding it. The whole image, background included, is about
   +23% brighter in linear luminance, so never compare absolute luminance between input and render. The result is an RGBA
   PNG with a fully opaque alpha channel even though the URL ended in `.jpg`. Because no `skin_smooth` effect was sent, the
   default smoothing (50) is applied to every render.
6. **Concealer `coverageLevel` barely changes the render** (20 vs 90 differ by 0.03/255 on average); foundation
   `coverageIntensity` does respond. The simulation is pixel-aligned (same size as the input) and only edits flagged regions.
7. **Empty or zero results are real.** The p2b redness mask is empty (one alpha value) and `hd_pore_forehead` has
   `raw_score` 0 on p2b while dense pore marks sit on that forehead. SD redness on p2b is fully transparent.
8. **Not recorded:** an SD run for p3a, VTO for p3a, simulation for p2b.

## Size

About 15.5 MB in total (14.8 MiB): renders 11.5 MB (VTO 9.4 MB, simulation 2.1 MB), HD masks 2.7 MB, SD masks 0.5 MB, inputs
0.8 MB, JSON under 20 KB. The largest mask is 213 KB, so no mask was re-encoded. The renders were left byte-identical:
palette quantisation would change pixel values, and a lossless re-encode saved little (none for VTO, about 24% for the simulation).

## scale.json (per persona)
Iris-ruler scale for the analysed frame (`input.jpg`), computed by `scripts/scale/fixtures.ts` with MediaPipe Face
Landmarker in headless Chrome. Fields are the `ScaleEstimate` contract (`mmPerPx`, `relSd`, `source: "iris"`, `irisPx`)
plus diagnostics. `mmPerPx` applies to the analysed (resized) frame, not the original photo.
