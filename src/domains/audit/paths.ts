import { relative, resolve } from "node:path";
import { AuditVerdict } from "./reader";

export const AUDIT_PATH_DEFECT = {
  ESCAPES_ROOT: "path escapes product directory",
  MISSING_FILE: "missing file",
} as const;

export type AuditPathExists = (absolutePath: string) => boolean;

export function validatePaths(
  verdict: AuditVerdict,
  productDir: string,
  fileExists: AuditPathExists,
): readonly string[] {
  const defects: string[] = [];
  const root = resolve(productDir);

  for (const gate of verdict.gates) {
    for (const finding of gate.findings) {
      checkPath(finding.spec_file, root, fileExists, defects);
      checkPath(finding.test_file, root, fileExists, defects);
    }
  }

  return defects;
}

function checkPath(
  filePath: string | undefined,
  root: string,
  fileExists: AuditPathExists,
  defects: string[],
): void {
  if (!filePath) return;

  const absolutePath = resolve(root, filePath);
  const rel = relative(root, absolutePath);
  if (rel.startsWith("..")) {
    defects.push(`${AUDIT_PATH_DEFECT.ESCAPES_ROOT}: ${filePath}`);
    return;
  }

  if (!fileExists(absolutePath)) {
    defects.push(`${AUDIT_PATH_DEFECT.MISSING_FILE}: ${filePath}`);
  }
}
