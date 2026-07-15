import type { Domain } from "@/interfaces/cli/domain";

import { agentDomain } from "./agent";
import { compactDomain } from "./compact";
import { configDomain } from "./config";
import { diagnoseDomain } from "./diagnose";
import { hookDomain } from "./hook";
import { journalDomain } from "./journal";
import { releaseDomain } from "./release";
import { sessionDomain } from "./session";
import { specDomain } from "./spec";
import { testingDomain } from "./test";
import { validationDomain } from "./validation";
import { verificationContextDomain } from "./verification-context";
import { verifyDomain } from "./verify";
import { worktreeDomain } from "./worktree";

export const CLI_DOMAINS: readonly Domain[] = [
  agentDomain,
  compactDomain,
  configDomain,
  diagnoseDomain,
  hookDomain,
  journalDomain,
  releaseDomain,
  sessionDomain,
  specDomain,
  testingDomain,
  validationDomain,
  verificationContextDomain,
  verifyDomain,
  worktreeDomain,
];
