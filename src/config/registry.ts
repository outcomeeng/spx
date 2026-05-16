import { agentEnvironmentConfigDescriptor } from "@/domains/agent-environment/config";
import { auditConfigDescriptor } from "@/domains/audit/config";
import { fileInclusionConfigDescriptor } from "@/lib/file-inclusion/config";
import { precommitConfigDescriptor } from "@/lib/precommit/config";
import { specTreeConfigDescriptor } from "@/lib/spec-tree/config";
import { testingConfigDescriptor } from "@/testing/config";
import { validationConfigDescriptor } from "@/validation/config/descriptor";

import type { ConfigDescriptor } from "./types";

export const productionRegistry: readonly ConfigDescriptor<unknown>[] = [
  specTreeConfigDescriptor,
  validationConfigDescriptor,
  testingConfigDescriptor,
  fileInclusionConfigDescriptor,
  precommitConfigDescriptor,
  agentEnvironmentConfigDescriptor,
  auditConfigDescriptor,
] as const;
