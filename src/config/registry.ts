import { specTreeConfigDescriptor } from "@/spec/config.js";
import { literalConfigDescriptor } from "@/validation/literal/config.js";

import type { ConfigDescriptor } from "./types.js";

export const productionRegistry: readonly ConfigDescriptor<unknown>[] = [
  specTreeConfigDescriptor,
  literalConfigDescriptor,
] as const;
