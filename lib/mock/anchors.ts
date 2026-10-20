import type { DistanceAnchor } from "@/components/results/types";

/** Stand-in for the distance anchors in lib/copy. */
export const MOCK_ANCHORS: DistanceAnchor[] = [
  { distanceM: 0.25, label: "Mirror", short: "Mirror" },
  { distanceM: 0.3, label: "Selfie", short: "Selfie" },
  { distanceM: 1, label: "Conversation", short: "Talk" },
  { distanceM: 1.5, label: "Across a table", short: "Table" },
  { distanceM: 4, label: "Across a room", short: "Room" },
];
