/** The one place the agent meets lib/rehearse (the deterministic engines). Everything else takes a RehearseEngine. */
import {
  defaultCall,
  faceFromBundle,
  findFreeFix,
  lightLuminance,
  lightestTouch,
  observeScene,
  receiptAt,
  videoCallFrame,
  worthIt,
} from "@/lib/rehearse";
import type { RehearseEngine } from "./types";

export const realEngine: RehearseEngine = {
  lightLuminance,
  defaultCall,
  videoCallFrame,
  observeScene,
  findFreeFix,
  lightestTouch,
  worthIt,
  receiptAt,
};

export { faceFromBundle };
