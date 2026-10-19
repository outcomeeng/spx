import { readFile, stat } from "node:fs/promises";

import { computeContentDigests, type ContentDigests } from "./digests";
import {
  type ListProductFiles,
  listProductFilesWithGit,
  type OperandRequest,
  resolveOperand,
  VERIFICATION_INPUT_REJECTION,
  type VerificationInputRejection,
} from "./resolve-operand";

export interface VerificationInput {
  /** Canonical product-relative path with forward-slash separators. */
  readonly path: string;
  readonly contentDigests: ContentDigests;
}

export interface VerificationInputDiagnostic {
  readonly operand: string;
  readonly reason: VerificationInputRejection;
}

export type VerificationInputInspection =
  | { readonly ok: true; readonly value: VerificationInput }
  | { readonly ok: false; readonly diagnostic: VerificationInputDiagnostic };

const UTF8_LABEL = "utf-8";

function reject(operand: string, reason: VerificationInputRejection): VerificationInputInspection {
  return { ok: false, diagnostic: { operand, reason } };
}

/**
 * Reports one product file's canonical path and content digests. Read-only: it opens no run,
 * appends no journal event, and writes no file.
 */
export async function inspectVerificationInput(
  request: OperandRequest,
  listFiles: ListProductFiles = listProductFilesWithGit,
): Promise<VerificationInputInspection> {
  const resolution = await resolveOperand(request, listFiles);
  if (!resolution.ok) return reject(request.operand, resolution.reason);

  let bytes: Uint8Array;
  try {
    if (!(await stat(resolution.absolutePath)).isFile()) {
      return reject(request.operand, VERIFICATION_INPUT_REJECTION.NOT_REGULAR_FILE);
    }
    bytes = await readFile(resolution.absolutePath);
  } catch {
    return reject(request.operand, VERIFICATION_INPUT_REJECTION.UNREADABLE);
  }

  let text: string;
  try {
    text = new TextDecoder(UTF8_LABEL, { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return reject(request.operand, VERIFICATION_INPUT_REJECTION.INVALID_UTF8);
  }

  return { ok: true, value: { path: resolution.path, contentDigests: computeContentDigests(bytes, text) } };
}
