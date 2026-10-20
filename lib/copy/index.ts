/**
 * Deterministic copy: distances, concern names, sentence templates and the banned-word lists.
 * The linter reads the disk, so it is not exported here; import `lintText` and `lintFiles` from
 * "@/lib/copy/lint" in CI tests.
 */
export * from "./distance";
export * from "./concerns";
export * from "./describe";
export * from "./profile";
export * from "./worthit";
export * from "./banned";
