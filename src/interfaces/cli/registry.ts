import type { Domain } from "@/domains/types";

import { claudeDomain } from "./claude";
import { compactDomain } from "./compact";
import { configDomain } from "./config";
import { sessionDomain } from "./session";
import { specDomain } from "./spec";
import { testingDomain } from "./testing";
import { validationDomain } from "./validation";
import { worktreeDomain } from "./worktree";

export const CLI_DOMAINS: readonly Domain[] = [
  claudeDomain,
  compactDomain,
  configDomain,
  sessionDomain,
  specDomain,
  testingDomain,
  validationDomain,
  worktreeDomain,
];
