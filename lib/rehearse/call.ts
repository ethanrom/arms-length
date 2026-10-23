/**
 * Video-call geometry: how big your face looks to the other person, and what the video can carry.
 *
 * The other person sees your whole camera frame on a screen tile. Your face then subtends the same angle at their eye as it
 * would in person at
 *
 *   d_eq = viewerDistance * frameHeight / tileHeight,   frameHeight = 2 * D * tan(vfov / 2)
 *
 * where D is your distance to your camera (the frame height is measured at your face). The video itself is `rows` pixels tall,
 * so one pixel covers frameHeight / rows on your face and the smallest detail it can carry is two pixels:
 *
 *   resolutionFloorMm = 2 * frameHeight / rows
 *
 * Marks smaller than that are lost in the video whatever the other person's eyes. Compression (not modelled) hides more, so
 * both numbers are cautious: the real picture is, if anything, softer than this says.
 *
 * Every parameter below is either cited or labelled "Project assumption" (CLAUDE.md: a source for every model parameter).
 */
import type { CallFrameResult, CallGeometry } from "../contracts/rehearse";
import { formatDistance } from "../copy/distance";
import { SceneError, hasOwn } from "./errors";
import { cmText, mmText } from "./quotes";

export type Device = CallGeometry["device"];
export type Layout = CallGeometry["layout"];

export interface DeviceProfile {
  label: string;
  /** Vertical field of view of the camera along the picture's vertical axis, degrees. */
  vfovDeg: number;
  /** Typical distance from your face to the camera, cm (the default for a call). */
  typicalCm: number;
  /** The farthest you can reasonably get from the camera and still use it, cm (the camera_distance lever stops here). */
  maxCm: number;
  /** Rows of the received video along the picture's vertical axis. */
  rows: Record<Layout, number>;
  fovSource: string;
  distanceSource: string;
  rowsSource: string;
}

export const DEVICES: Record<Device, DeviceProfile> = {
  laptop: {
    label: "laptop",
    vfovDeg: 46,
    typicalCm: 50,
    maxCm: 90,
    rows: { speaker: 720, gallery: 360 },
    fovSource:
      "Project assumption: a built-in laptop webcam is roughly 80 degrees diagonal, which on a 16:9 frame is about 46 degrees vertical.",
    distanceSource:
      "Project assumption: about 50 cm, the near end of the 50 to 100 cm usually advised for monitor distance (OSHA computer workstations guidance). The most you can sit back and still reach the keys is taken as 90 cm.",
    rowsSource:
      "Project assumption: calls send about 720 rows to a large tile (HD) and about 360 rows to a small gallery tile, as video-call services scale each person's picture to the tile it fills.",
  },
  phone: {
    label: "phone",
    vfovDeg: 67,
    typicalCm: 35,
    maxCm: 70,
    rows: { speaker: 1280, gallery: 640 },
    fovSource:
      "Project assumption: a phone's front camera is roughly 80 degrees diagonal; held upright with a 3:4 frame that is about 67 degrees along the long, vertical side.",
    distanceSource:
      "Selfies are typically taken at about 30 cm (Ward et al. 2018, JAMA Facial Plast Surg 20(4)); about 35 cm is taken for a call (Project assumption). The most is an arm's length, about 70 cm (Project assumption).",
    rowsSource:
      "Project assumption: an upright phone sends 720 by 1280 to a large tile and 360 by 640 to a small gallery tile, so the long side is the vertical.",
  },
  desktop: {
    label: "desktop screen",
    vfovDeg: 43.5,
    typicalCm: 70,
    maxCm: 100,
    rows: { speaker: 720, gallery: 360 },
    fovSource:
      "Project assumption: a common external webcam is about 78 degrees diagonal, which on a 16:9 frame is about 43.5 degrees vertical.",
    distanceSource:
      "Project assumption: about 70 cm, inside the 50 to 100 cm usually advised for monitor distance (OSHA computer workstations guidance); the most is 100 cm, the far end of that range.",
    rowsSource:
      "Project assumption: calls send about 720 rows to a large tile and about 360 rows to a small gallery tile.",
  },
};

/** Valid range for a stated camera distance, cm. Outside it the figure is more likely a slip (metres for centimetres). */
export const CAMERA_CM_RANGE: readonly [number, number] = [20, 200];

/** The other person's screen: the same in every call. */
export const VIEWER_SCREEN = {
  distanceM: 0.6,
  tileHeightM: { speaker: 0.17, gallery: 0.07 } satisfies Record<Layout, number>,
  distanceSource:
    "Project assumption: they sit about 60 cm from a laptop screen, inside the 50 to 100 cm usually advised for monitor distance (OSHA computer workstations guidance).",
  tileSource:
    "Project assumption: on a 15-inch laptop screen (about 19 cm tall) a speaker view fills about 17 cm and a gallery tile of four to nine people about 7 cm.",
} as const;

export const LAYOUT_PHRASE: Record<Layout, string> = {
  speaker: "you alone (speaker view)",
  gallery: "a small gallery tile",
};

export function deviceProfile(device: Device): DeviceProfile {
  return DEVICES[device];
}

/** Your camera's frame height at your face, mm. */
export function frameHeightMm(device: Device, cameraDistanceCm: number): number {
  return 2 * cameraDistanceCm * 10 * Math.tan((DEVICES[device].vfovDeg * Math.PI) / 360);
}

/** The default call for a device: typical camera distance, speaker view. */
export function defaultCall(device: Device, layout: Layout = "speaker"): CallGeometry {
  return { device, cameraDistanceCm: DEVICES[device].typicalCm, layout };
}

/** Throws SceneError unless `call` is a known device and layout with a camera distance in range. Returns a clean copy. */
export function validateCall(call: unknown): CallGeometry {
  const c = call as Partial<CallGeometry> | null | undefined;
  if (!c || typeof c !== "object") throw new SceneError("video_call needs a call: { device, cameraDistanceCm, layout }.");
  if (!hasOwn(DEVICES, c.device)) throw new SceneError(`Unknown call device "${String(c.device)}". Valid devices: ${Object.keys(DEVICES).join(", ")}.`);
  if (c.layout !== "speaker" && c.layout !== "gallery") throw new SceneError(`Unknown call layout "${String(c.layout)}". Valid layouts: speaker, gallery.`);
  const cm = c.cameraDistanceCm;
  const [lo, hi] = CAMERA_CM_RANGE;
  if (typeof cm !== "number" || !Number.isFinite(cm) || cm < lo || cm > hi) {
    throw new SceneError(`cameraDistanceCm must be a number of centimetres from ${lo} to ${hi}; got ${String(cm)}.`);
  }
  return { device: c.device as Device, cameraDistanceCm: cm, layout: c.layout };
}

export function videoCallFrame(call: CallGeometry, ref: string): CallFrameResult {
  const geometry = validateCall(call);
  const profile = DEVICES[geometry.device];
  const frame = frameHeightMm(geometry.device, geometry.cameraDistanceCm);
  const tileM = VIEWER_SCREEN.tileHeightM[geometry.layout];
  const equivalentDistanceM = (VIEWER_SCREEN.distanceM * (frame / 1000)) / tileM;
  const resolutionFloorMm = (2 * frame) / profile.rows[geometry.layout];

  return {
    ref,
    call: geometry,
    equivalentDistanceM,
    resolutionFloorMm,
    quotes: {
      device: profile.label,
      layout: LAYOUT_PHRASE[geometry.layout],
      cameraDistance: cmText(geometry.cameraDistanceCm),
      equivalentDistance: formatDistance(equivalentDistanceM),
      resolutionFloor: `${mmText(resolutionFloorMm)} mm`,
      viewerDistance: cmText(VIEWER_SCREEN.distanceM * 100),
      tileHeight: cmText(tileM * 100),
    },
    assumptions: [
      `Camera: ${profile.fovSource}`,
      `Your distance to the camera: ${profile.distanceSource}`,
      `The other person's screen: ${VIEWER_SCREEN.distanceSource} ${VIEWER_SCREEN.tileSource}`,
      `Video size: ${profile.rowsSource} The smallest detail the video carries is taken as two rows of pixels.`,
      "The whole camera frame is assumed to fill the height of the tile.",
      "Video compression hides more than this removes, so the distance is a cautious estimate: the real picture is, if anything, softer.",
    ],
  };
}
