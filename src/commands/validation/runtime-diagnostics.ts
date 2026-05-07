/**
 * Runtime diagnostic markers that validation commands must not accidentally emit.
 *
 * @module commands/validation/runtime-diagnostics
 */

export const VALIDATION_RUNTIME_ANTI_MARKERS = {
  NPX_INSTALL_PROMPT: "Need to install the following packages",
  ENOENT: "ENOENT",
} as const;
