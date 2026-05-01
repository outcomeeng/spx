import { specTreeConfigDescriptor } from "@/lib/spec-tree/config";
import { literalConfigDescriptor } from "@/validation/literal/config";

import type { ConfigDescriptor } from "./types";

export const productionRegistry: readonly ConfigDescriptor<unknown>[] = [
  specTreeConfigDescriptor,
  literalConfigDescriptor,
] as const;
