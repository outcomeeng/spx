import type { Domain } from "@/domains/types";

import { auditDomain } from "./audit";
import { claudeDomain } from "./claude";
import { compactDomain } from "./compact";
import { configDomain } from "./config";
import { hookDomain } from "./hook";
import { journalDomain } from "./journal";
import { sessionDomain } from "./session";
import { specDomain } from "./spec";
import { testingDomain } from "./testing";
import { validationDomain } from "./validation";
import { worktreeDomain } from "./worktree";

export const CLI_DOMAINS: readonly Domain[] = [
  auditDomain,
  claudeDomain,
  compactDomain,
  configDomain,
  hookDomain,
  journalDomain,
  sessionDomain,
  specDomain,
  testingDomain,
  validationDomain,
  worktreeDomain,
];
