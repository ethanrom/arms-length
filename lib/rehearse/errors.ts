/** A scene the tools cannot resolve. The message is written for the agent to repair its call from (valid ids and ranges). */
export class SceneError extends Error {
  readonly code = "bad_scene" as const;

  constructor(message: string) {
    super(message);
    this.name = "SceneError";
  }
}

export const hasOwn = (obj: object, key: unknown): key is string => typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);
