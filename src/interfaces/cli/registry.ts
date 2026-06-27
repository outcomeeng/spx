import type { Domain } from "@/domains/types";

import { agentDomain } from "./agent";
import { claudeDomain } from "./claude";
import { compactDomain } from "./compact";
import { configDomain } from "./config";
import { diagnoseDomain } from "./diagnose";
import { hookDomain } from "./hook";
import { journalDomain } from "./journal";
import { sessionDomain } from "./session";
import { specDomain } from "./spec";
import { testingDomain } from "./test";
import { validationDomain } from "./validation";
import { verificationContextDomain } from "./verification-context";
import { worktreeDomain } from "./worktree";

export const CLI_DOMAINS: readonly Domain[] = [
  agentDomain,
  claudeDomain,
  compactDomain,
  configDomain,
  diagnoseDomain,
  hookDomain,
  journalDomain,
  sessionDomain,
  specDomain,
  testingDomain,
  validationDomain,
  verificationContextDomain,
  worktreeDomain,
];
