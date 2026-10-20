// AnalysisResponse.fileRef is opaque to the client. We use:
//   persona:<id>                  a recorded demo face (replay, no units)
//   live:<width>x<height>:<id>    a YouCam file_id plus the uploaded size, so a render's offset can be
//                                 computed on a later request without server-side session state
//   <id>                          a bare YouCam file_id (frame unknown)
import type { Size2 } from "@/lib/contracts";
import { PERSONA_PREFIX } from "./replay";

export type FileRef =
  | { kind: "persona"; id: string }
  | { kind: "live"; fileId: string; frame: Size2 | null };

const FILE_ID = "[A-Za-z0-9+/=_.-]{16,256}";
const LIVE_REF = new RegExp(`^live:(\\d{2,5})x(\\d{2,5}):(${FILE_ID})$`);
const BARE_ID = new RegExp(`^${FILE_ID}$`);
const PERSONA_REF = /^persona:([a-z0-9_-]{1,32})$/i;

export function liveFileRef(fileId: string, frame: Size2): string {
  return `live:${frame.width}x${frame.height}:${fileId}`;
}

export function parseFileRef(ref: string): FileRef | null {
  if (ref.startsWith(PERSONA_PREFIX)) {
    const match = PERSONA_REF.exec(ref);
    return match ? { kind: "persona", id: match[1] } : null;
  }
  const live = LIVE_REF.exec(ref);
  if (live) return { kind: "live", fileId: live[3], frame: { width: Number(live[1]), height: Number(live[2]) } };
  return BARE_ID.test(ref) ? { kind: "live", fileId: ref, frame: null } : null;
}
