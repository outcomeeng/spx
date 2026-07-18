import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function packageVersion(value: unknown): string {
  if (typeof value !== "object" || value === null || !("version" in value) || typeof value.version !== "string") {
    throw new Error("package.json must declare a string version");
  }
  return value.version;
}

/** The version of the executing SPX package. */
export const SPX_VERSION = packageVersion(require("../package.json"));
