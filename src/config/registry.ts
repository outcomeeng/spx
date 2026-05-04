import { fileInclusionConfigDescriptor } from "@/lib/file-inclusion/config";
import { precommitConfigDescriptor } from "@/lib/precommit/config";
import { specTreeConfigDescriptor } from "@/lib/spec-tree/config";
import { validationConfigDescriptor } from "@/validation/config/descriptor";

import type { ConfigDescriptor } from "./types";

export const productionRegistry: readonly ConfigDescriptor<unknown>[] = [
  specTreeConfigDescriptor,
  validationConfigDescriptor,
  fileInclusionConfigDescriptor,
  precommitConfigDescriptor,
] as const;
