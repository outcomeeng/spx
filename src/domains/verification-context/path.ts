import { join } from "node:path";

import type { Result } from "@/config/types";
import { branchScopeDir, composeScopeDir, validateScopeToken } from "@/lib/state-store";

import { VERIFICATION_CONTEXT_PERSISTENCE } from "./context";

export const VERIFICATION_CONTEXT_STATE_DOMAIN = VERIFICATION_CONTEXT_PERSISTENCE.domain;

export const VERIFICATION_CONTEXT_STATE_PATH = {
  CONTEXTS_DIR: "contexts",
  FILE_PREFIX: "context-",
  JSON_EXTENSION: ".json",
} as const;

export interface VerificationContextPathScope {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly digest: string;
}

export function verificationContextFileName(digest: string): string {
  return `${VERIFICATION_CONTEXT_STATE_PATH.FILE_PREFIX}${digest}${VERIFICATION_CONTEXT_STATE_PATH.JSON_EXTENSION}`;
}

export function verificationContextFilePath(scope: VerificationContextPathScope): Result<string> {
  const branchScope = branchScopeDir(scope.productDir, scope.branchSlug);
  if (!branchScope.ok) return branchScope;
  const contextsDir = composeScopeDir(
    branchScope.value,
    VERIFICATION_CONTEXT_STATE_DOMAIN,
    VERIFICATION_CONTEXT_STATE_PATH.CONTEXTS_DIR,
  );
  if (!contextsDir.ok) return contextsDir;
  const digest = validateScopeToken(scope.digest);
  if (!digest.ok) return digest;
  return { ok: true, value: join(contextsDir.value, verificationContextFileName(digest.value)) };
}
