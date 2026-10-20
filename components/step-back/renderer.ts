/**
 * INTEGRATION POINT: the one place that decides which DistanceRenderer draws the Step back images.
 * Today it is the placeholder blur from lib/mock. Swap this line for the real renderer from lib/vision.
 */
export { mockDistanceRenderer as distanceRenderer } from "@/lib/mock/distanceRenderer";
