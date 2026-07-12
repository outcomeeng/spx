import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** The version of the executing SPX package. */
export const SPX_VERSION = (require("../package.json") as { readonly version: string }).version;
