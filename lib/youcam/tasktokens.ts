// Opaque, signed task tokens: what a live response hands the browser so it can ask for its YouCam tasks to be deleted
// when the visitor leaves (POST /api/youcam/cleanup). The signature stops a visitor from deleting tasks this server did
// not create for them; the token reveals nothing but the task id YouCam already gave the server.
import { createHmac, timingSafeEqual } from "node:crypto";

const SIG_CHARS = 24;

function signature(secret: string, taskId: string): string {
  return createHmac("sha256", `arms-length|task|${secret}`).update(taskId).digest("hex").slice(0, SIG_CHARS);
}

export function signTaskId(secret: string, taskId: string): string {
  return `${taskId}.${signature(secret, taskId)}`;
}

/** The task id inside a token this server signed, or null for anything else. */
export function verifyTaskToken(secret: string, token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const taskId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signature(secret, taskId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? taskId : null;
}
