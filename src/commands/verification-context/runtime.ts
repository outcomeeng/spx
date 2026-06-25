import { dirname } from "node:path";

import type { Result } from "@/config/types";
import type { VerificationContextDocumentResult } from "@/domains/verification-context/context";
import { verificationContextFilePath, type VerificationContextPathScope } from "@/domains/verification-context/path";
import { toMessage } from "@/lib/error-message";
import {
  defaultStateStoreFileSystem,
  ERROR_CODE_FILE_EXISTS,
  EXCLUSIVE_CREATE_FLAG,
  hasErrorCode,
  STATE_STORE_TEXT_ENCODING,
  type StateStoreFileSystem,
} from "@/lib/state-store";

export const VERIFICATION_CONTEXT_RUNTIME_ERROR = {
  READ_FAILED: "verification context read failed",
  WRITE_FAILED: "verification context write failed",
  CONTENT_MISMATCH: "verification context already exists with different content",
} as const;

export interface PersistVerificationContextOptions {
  readonly fs?: StateStoreFileSystem;
}

export interface PersistedVerificationContext {
  readonly digest: string;
  readonly contextPath: string;
}

export async function persistVerificationContext(
  scope: VerificationContextPathScope,
  document: VerificationContextDocumentResult,
  options: PersistVerificationContextOptions = {},
): Promise<Result<PersistedVerificationContext>> {
  const contextPath = verificationContextFilePath(scope);
  if (!contextPath.ok) return contextPath;
  const fs = options.fs ?? defaultStateStoreFileSystem;
  try {
    await fs.mkdir(dirname(contextPath.value), { recursive: true });
    await fs.writeFile(contextPath.value, document.canonicalJson, { flag: EXCLUSIVE_CREATE_FLAG });
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) {
      const existing = await readExistingContext(fs, contextPath.value);
      if (!existing.ok) return existing;
      if (existing.value === document.canonicalJson) {
        return { ok: true, value: { digest: document.digest, contextPath: contextPath.value } };
      }
      return { ok: false, error: VERIFICATION_CONTEXT_RUNTIME_ERROR.CONTENT_MISMATCH };
    }
    return { ok: false, error: `${VERIFICATION_CONTEXT_RUNTIME_ERROR.WRITE_FAILED}: ${toMessage(error)}` };
  }
  return { ok: true, value: { digest: document.digest, contextPath: contextPath.value } };
}

async function readExistingContext(fs: StateStoreFileSystem, contextPath: string): Promise<Result<string>> {
  try {
    return { ok: true, value: await fs.readFile(contextPath, STATE_STORE_TEXT_ENCODING) };
  } catch (error) {
    return { ok: false, error: `${VERIFICATION_CONTEXT_RUNTIME_ERROR.READ_FAILED}: ${toMessage(error)}` };
  }
}
