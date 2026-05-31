import type { Domain } from "@/domains/types";

import { auditDomain } from "./audit";
import { claudeDomain } from "./claude";
import { configDomain } from "./config";
import { sessionDomain } from "./session";
import { specDomain } from "./spec";
import { validationDomain } from "./validation";

export const CLI_DOMAINS: readonly Domain[] = [
  auditDomain,
  claudeDomain,
  configDomain,
  sessionDomain,
  specDomain,
  validationDomain,
];
