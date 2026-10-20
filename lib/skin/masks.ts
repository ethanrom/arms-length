/**
 * YouCam mask decoding and binary-image morphology: foreground, connected components, hole filling,
 * Euclidean distance transform, skeletonisation. Pure and DOM-free.
 *
 * Mask anatomy (internal/research/spike.md section 4.1): HD masks carry a baked dark layer at a fixed
 * alpha covering nearly the whole frame, so the modal alpha is the background and a feature is any
 * pixel whose alpha differs from it. Region masks and SD masks have a transparent background (modal 0).
 */
import type { Box, Point, RgbaImage } from "../contracts";

/**
 * Smallest |alpha - background| that counts as foreground. The HD pore mask has near-background
 * values 94-101 around a background of 102 (spike alpha statistics); 8 sits above them and below any
 * drawn mark (the faintest age-spot contour value is 28 on a background of 51).
 */
export const DEFAULT_MIN_DIFF = 8;

/** The most common alpha value of a mask: its background. Ties go to the lower value. */
export function modalAlpha(mask: RgbaImage): number {
  const hist = new Uint32Array(256);
  const d = mask.data;
  for (let i = 3; i < d.length; i += 4) hist[d[i]]++;
  let best = 0;
  for (let a = 1; a < 256; a++) if (hist[a] > hist[best]) best = a;
  return best;
}

export interface Foreground {
  width: number;
  height: number;
  /** Modal alpha. */
  background: number;
  /** |alpha - background| per pixel: the weight map (divide by 255 for 0..1). */
  diff: Uint8Array;
  /** 1 where diff >= minDiff. */
  binary: Uint8Array;
  /** Number of foreground pixels. */
  count: number;
  /** Largest diff in the mask. */
  maxDiff: number;
}

export function binariseDiff(diff: Uint8Array, threshold: number): Uint8Array {
  const out = new Uint8Array(diff.length);
  for (let i = 0; i < diff.length; i++) out[i] = diff[i] >= threshold ? 1 : 0;
  return out;
}

/** Foreground of a mask under the modal-alpha rule, as a weight map and a binary map. */
export function foregroundOf(mask: RgbaImage, minDiff = DEFAULT_MIN_DIFF): Foreground {
  const n = mask.width * mask.height;
  const background = modalAlpha(mask);
  const diff = new Uint8Array(n);
  let maxDiff = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.abs(mask.data[i * 4 + 3] - background);
    diff[i] = v;
    if (v > maxDiff) maxDiff = v;
  }
  const binary = binariseDiff(diff, minDiff);
  let count = 0;
  for (let i = 0; i < n; i++) count += binary[i];
  return { width: mask.width, height: mask.height, background, diff, binary, count, maxDiff };
}

export interface Component {
  /** Pixel count. */
  area: number;
  /** Inclusive pixel extent. */
  bbox: Box;
  /** Mean pixel-centre coordinates. */
  centroid: Point;
  /** Linear pixel indices (y * width + x). Empty when `keepPixels` is false. */
  pixels: Int32Array;
}

export interface ComponentOptions {
  connectivity?: 4 | 8;
  keepPixels?: boolean;
}

/** Connected components in scan order (by first pixel), 8-connected by default. */
export function connectedComponents(
  binary: Uint8Array,
  width: number,
  height: number,
  { connectivity = 8, keepPixels = true }: ComponentOptions = {},
): Component[] {
  const n = width * height;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  const out: Component[] = [];
  let tail = 0;
  for (let start = 0; start < n; start++) {
    if (!binary[start] || seen[start]) continue;
    const begin = tail;
    let head = tail;
    queue[tail++] = start;
    seen[start] = 1;
    let sx = 0;
    let sy = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    while (head < tail) {
      const i = queue[head++];
      const x = i % width;
      const y = (i - x) / width;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx === 0 && dy === 0) || (connectivity === 4 && dx !== 0 && dy !== 0)) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const j = ny * width + nx;
          if (binary[j] && !seen[j]) {
            seen[j] = 1;
            queue[tail++] = j;
          }
        }
      }
    }
    const area = tail - begin;
    out.push({
      area,
      bbox: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
      centroid: { x: sx / area, y: sy / area },
      pixels: keepPixels ? queue.slice(begin, tail) : new Int32Array(0),
    });
  }
  return out;
}

/**
 * Fills holes: background regions (4-connected, the dual of 8-connected foreground) that do not touch
 * the image border. Holes larger than `maxHoleArea` are left open so a ring of neighbouring marks that
 * happens to enclose a stretch of skin is not turned into one giant blob.
 */
export function fillHoles(binary: Uint8Array, width: number, height: number, maxHoleArea = Infinity): Uint8Array {
  const inverse = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) inverse[i] = binary[i] ? 0 : 1;
  const out = binary.slice();
  for (const c of connectedComponents(inverse, width, height, { connectivity: 4 })) {
    const touchesBorder = c.bbox.x === 0 || c.bbox.y === 0 || c.bbox.x + c.bbox.w === width || c.bbox.y + c.bbox.h === height;
    if (touchesBorder || c.area > maxHoleArea) continue;
    for (let p = 0; p < c.pixels.length; p++) out[c.pixels[p]] = 1;
  }
  return out;
}

/** Square dilation by `radius` px (Chebyshev), separable. */
export function dilate(binary: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return binary.slice();
  const tmp = new Uint8Array(binary.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!binary[row + x]) continue;
      const a = Math.max(0, x - radius);
      const b = Math.min(width - 1, x + radius);
      for (let xx = a; xx <= b; xx++) tmp[row + xx] = 1;
    }
  }
  const out = new Uint8Array(binary.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (!tmp[y * width + x]) continue;
      const a = Math.max(0, y - radius);
      const b = Math.min(height - 1, y + radius);
      for (let yy = a; yy <= b; yy++) out[yy * width + x] = 1;
    }
  }
  return out;
}

const FAR = 1e12;

// Felzenszwalb & Huttenlocher (2012), "Distance transforms of sampled functions": exact 1-D squared
// Euclidean transform by lower envelope of parabolas.
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/**
 * Exact Euclidean distance from every pixel to the nearest pixel where `source` is set (0 on the
 * source itself). With an empty source every value is about 1e6.
 */
export function distanceToSet(source: Uint8Array, width: number, height: number): Float32Array {
  const m = Math.max(width, height);
  const f = new Float64Array(m);
  const d = new Float64Array(m);
  const v = new Int32Array(m);
  const z = new Float64Array(m + 1);
  const grid = new Float64Array(width * height);
  for (let i = 0; i < grid.length; i++) grid[i] = source[i] ? 0 : FAR;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) grid[y * width + x] = d[x];
  }
  const out = new Float32Array(grid.length);
  for (let i = 0; i < grid.length; i++) out[i] = Math.sqrt(grid[i]);
  return out;
}

/** Distance from each foreground pixel to the nearest background pixel centre (0 on the background). */
export function insideDistance(binary: Uint8Array, width: number, height: number): Float32Array {
  const inverse = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) inverse[i] = binary[i] ? 0 : 1;
  return distanceToSet(inverse, width, height);
}

/** Zhang-Suen thinning (Zhang & Suen 1984). Out-of-image pixels count as background. */
export function skeletonise(binary: Uint8Array, width: number, height: number): Uint8Array {
  const img = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) img[i] = binary[i] ? 1 : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : img[y * width + x]);
  const doomed: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      doomed.length = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!img[y * width + x]) continue;
          const p2 = at(x, y - 1);
          const p3 = at(x + 1, y - 1);
          const p4 = at(x + 1, y);
          const p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1);
          const p7 = at(x - 1, y + 1);
          const p8 = at(x - 1, y);
          const p9 = at(x - 1, y - 1);
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a =
            (p2 === 0 && p3 === 1 ? 1 : 0) + (p3 === 0 && p4 === 1 ? 1 : 0) + (p4 === 0 && p5 === 1 ? 1 : 0) +
            (p5 === 0 && p6 === 1 ? 1 : 0) + (p6 === 0 && p7 === 1 ? 1 : 0) + (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) + (p9 === 0 && p2 === 1 ? 1 : 0);
          if (a !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          doomed.push(y * width + x);
        }
      }
      if (doomed.length) changed = true;
      for (const i of doomed) img[i] = 0;
    }
  }
  return img;
}

export interface SkeletonInfo {
  /** Skeleton pixel indices (in the grid passed in). */
  pixels: Int32Array;
  /** Skeleton neighbours per pixel (parallel to `pixels`): 1 is an end, 3 or more a junction. */
  degree: Uint8Array;
  /** Sum of all skeleton edges in px (orthogonal 1, diagonal sqrt 2). */
  totalLength: number;
  /** Longest shortest path between two skeleton pixels, in px (exact for trees). */
  longestPath: number;
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.keys;
    const v = this.vals;
    const top: [number, number] = [k[0], v[0]];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (k.length) {
      k[0] = lastK;
      v[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Lengths and topology of a 1-px-wide skeleton. */
export function analyseSkeleton(skel: Uint8Array, width: number, height: number): SkeletonInfo {
  const nodeOf = new Int32Array(skel.length).fill(-1);
  const list: number[] = [];
  for (let i = 0; i < skel.length; i++) {
    if (skel[i]) {
      nodeOf[i] = list.length;
      list.push(i);
    }
  }
  const n = list.length;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < width && y < height && skel[y * width + x] ? 1 : 0);
  const adj: number[][] = Array.from({ length: n }, () => []);
  const wts: number[][] = Array.from({ length: n }, () => []);
  let total = 0;
  const link = (a: number, b: number, w: number) => {
    adj[a].push(b);
    wts[a].push(w);
    adj[b].push(a);
    wts[b].push(w);
    total += w;
  };
  for (let k = 0; k < n; k++) {
    const i = list[k];
    const x = i % width;
    const y = (i - x) / width;
    if (at(x + 1, y)) link(k, nodeOf[i + 1], 1);
    if (at(x, y + 1)) link(k, nodeOf[i + width], 1);
    // A diagonal step is redundant when an orthogonal two-step route exists (corner of a staircase).
    if (at(x + 1, y + 1) && !at(x + 1, y) && !at(x, y + 1)) link(k, nodeOf[i + width + 1], Math.SQRT2);
    if (at(x - 1, y + 1) && !at(x - 1, y) && !at(x, y + 1)) link(k, nodeOf[i + width - 1], Math.SQRT2);
  }
  const dijkstra = (src: number): Float64Array => {
    const dist = new Float64Array(n).fill(Infinity);
    dist[src] = 0;
    const heap = new MinHeap();
    heap.push(0, src);
    while (heap.size) {
      const [dd, u] = heap.pop();
      if (dd > dist[u]) continue;
      for (let e = 0; e < adj[u].length; e++) {
        const nd = dd + wts[u][e];
        const t = adj[u][e];
        if (nd < dist[t]) {
          dist[t] = nd;
          heap.push(nd, t);
        }
      }
    }
    return dist;
  };
  let longest = 0;
  if (n > 0) {
    const far = (dist: Float64Array) => {
      let best = 0;
      for (let k = 0; k < n; k++) if (Number.isFinite(dist[k]) && dist[k] > dist[best]) best = k;
      return best;
    };
    const a = far(dijkstra(0));
    const d2 = dijkstra(a);
    longest = d2[far(d2)];
  }
  return {
    pixels: Int32Array.from(list),
    degree: Uint8Array.from(adj.map((a) => a.length)),
    totalLength: total,
    longestPath: longest,
  };
}
