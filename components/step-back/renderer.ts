/**
 * The one place that decides which DistanceRenderer draws the Step back images: the real one from lib/vision (the same
 * model that gives the numbers). Also used on the main thread if module workers are unavailable.
 */
export { renderDistanceView as distanceRenderer } from "@/lib/vision/renderer";
