import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";

import type { AuditVerdict } from "@/audit/reader";

export const AUDIT_PATH_DEFECT = {
  ESCAPES_ROOT: "path escapes project root",
  MISSING_FILE: "missing file",
} as const;

export function validatePaths(verdict: AuditVerdict, projectRoot: string): readonly string[] {
  const defects: string[] = [];
  const root = resolve(projectRoot);

  for (const gate of verdict.gates) {
    for (const finding of gate.findings) {
      checkPath(finding.spec_file, root, defects);
      checkPath(finding.test_file, root, defects);
    }
  }

  return defects;
}

function checkPath(filePath: string | undefined, root: string, defects: string[]): void {
  if (!filePath) return;

  const rel = relative(root, resolve(root, filePath));
  if (rel.startsWith("..")) {
    defects.push(`${AUDIT_PATH_DEFECT.ESCAPES_ROOT}: ${filePath}`);
    return;
  }

  if (!existsSync(resolve(root, filePath))) {
    defects.push(`${AUDIT_PATH_DEFECT.MISSING_FILE}: ${filePath}`);
  }
}
