"use client";

/**
 * A plain crew-neck top in front of the photo: it hides the soft cut at the bottom of the portrait and gives the head a
 * body to sit on. Sized to the photo at the scene's default distance (a photo at another distance still meets it well
 * enough: the neck stays clear and the shoulders land inside the face's feathered edge).
 */
import { C, Ink, W } from "./ink";
import { nominalPhotoBox, type InPersonScene } from "./layout";
import { smooth, type Pt } from "./shapes";

const tone = (pct: number) => `color-mix(in srgb, var(--ink) ${pct}%, var(--stage))`;

export function Garment({ scene, shade = 30 }: { scene: InPersonScene; shade?: number }) {
  const { cx, top, w, h } = nominalPhotoBox(scene);
  const nk = 0.27 * w;
  const nyTop = top + 0.885 * h;
  const apex = top + 0.985 * h;
  const mirror = (p: Pt): Pt => [2 * cx - p[0], p[1]];
  // The left side from the bottom up to the neck corner, then mirrored for the right.
  const left: Pt[] = [
    [cx - 1.13 * w, 1040],
    [cx - 1.12 * w, top + 1.55 * h],
    [cx - 1.1 * w, top + 1.2 * h],
    [cx - 0.98 * w, top + 1.06 * h],
    [cx - 0.7 * w, top + 0.945 * h],
    [cx - nk, nyTop],
  ];
  const right = left.map(mirror).reverse();
  const neck = `C${cx - nk} ${apex - 0.05 * h} ${cx - nk * 0.55} ${apex} ${cx} ${apex}C${cx + nk * 0.55} ${apex} ${cx + nk} ${apex - 0.05 * h} ${cx + nk} ${nyTop}`;
  const d = `${smooth(left, false, 0.8)}${neck}${smooth(right, false, 0.8).replace(/^M[^C]*/, "")}L${cx - 1.13 * w} 1040Z`;
  const rib = `M${cx - nk + 7} ${nyTop + 4}C${cx - nk + 7} ${apex - 0.02 * h} ${cx - nk * 0.5} ${apex + 9} ${cx} ${apex + 9}C${cx + nk * 0.5} ${apex + 9} ${cx + nk - 7} ${apex - 0.02 * h} ${cx + nk - 7} ${nyTop + 4}`;
  // Sleeve seams and a fold or two, so it reads as cloth and not a block.
  const seamL = smooth([[cx - 0.86 * w, top + 1.04 * h], [cx - 0.8 * w, top + 1.22 * h], [cx - 0.78 * w, top + 1.6 * h]]);
  const seamR = smooth([[cx + 0.86 * w, top + 1.04 * h], [cx + 0.8 * w, top + 1.22 * h], [cx + 0.78 * w, top + 1.6 * h]]);
  const fold = `M${cx - 0.34 * w} ${top + 1.18 * h}Q${cx - 0.26 * w} ${top + 1.34 * h} ${cx - 0.3 * w} ${top + 1.5 * h}M${cx + 0.38 * w} ${top + 1.2 * h}Q${cx + 0.3 * w} ${top + 1.36 * h} ${cx + 0.34 * w} ${top + 1.52 * h}`;
  return (
    <g>
      <Ink d={d} fill={tone(shade)} w={W.near} />
      <Ink d={rib} stroke={C.paper} w={W.line} o={0.3} />
      <Ink d={seamL} stroke={C.ink} w={W.line} o={0.5} />
      <Ink d={seamR} stroke={C.ink} w={W.line} o={0.5} />
      <Ink d={fold} stroke={C.ink} w={W.hair} o={0.3} />
    </g>
  );
}
