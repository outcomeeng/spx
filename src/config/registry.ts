import { harnessEnvironmentConfigDescriptor } from "@/domains/agent-environment/config";
import { diagnoseConfigDescriptor } from "@/domains/diagnose/config";
import { releaseConfigDescriptor } from "@/domains/release/config";
import { runtimeConfigDescriptor } from "@/lib/agent-run-journal/config";
import { fileInclusionConfigDescriptor } from "@/lib/file-inclusion/config";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { testingConfigDescriptor } from "@/test/config";
import { validationConfigDescriptor } from "@/validation/config/descriptor";

import { methodologyConfigDescriptor } from "./methodology";
import type { ConfigDescriptor } from "./types";

export const productionRegistry: readonly ConfigDescriptor<unknown>[] = [
  specTreeConfigDescriptor,
  validationConfigDescriptor,
  testingConfigDescriptor,
  fileInclusionConfigDescriptor,
  methodologyConfigDescriptor,
  harnessEnvironmentConfigDescriptor,
  diagnoseConfigDescriptor,
  releaseConfigDescriptor,
  runtimeConfigDescriptor,
] as const;
