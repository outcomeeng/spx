import type { Domain } from "@/domains/types";

import { auditDomain } from "./audit";
import { claudeDomain } from "./claude";
import { compactDomain } from "./compact";
import { configDomain } from "./config";
import { sessionDomain } from "./session";
import { specDomain } from "./spec";
import { testingDomain } from "./testing";
import { validationDomain } from "./validation";

export const CLI_DOMAINS: readonly Domain[] = [
  auditDomain,
  claudeDomain,
  compactDomain,
  configDomain,
  sessionDomain,
  specDomain,
  testingDomain,
  validationDomain,
];
