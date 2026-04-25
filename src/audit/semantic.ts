import type { AuditVerdict } from "@/audit/reader";

export function validateSemantics(verdict: AuditVerdict): readonly string[] {
  const defects: string[] = [];

  const hasFail = verdict.gates.some((g) => g.status === "FAIL");
  const hasSkipped = verdict.gates.some((g) => g.status === "SKIPPED");

  if (verdict.header?.verdict === "APPROVED" && (hasFail || hasSkipped)) {
    defects.push("incoherent verdict: APPROVED but at least one gate is not PASS");
  } else if (verdict.header?.verdict === "REJECT" && !hasFail && !hasSkipped) {
    defects.push("incoherent verdict: REJECT but all gates are PASS");
  }

  for (const gate of verdict.gates) {
    const label = gate.name ? `gate "${gate.name}"` : "gate";

    if (gate.status === "FAIL" && gate.findings.length === 0) {
      defects.push(`failed gate has no findings: ${label}`);
    }

    if (gate.status === "SKIPPED" && !gate.skipped_reason) {
      defects.push(`skipped gate missing reason: ${label}`);
    }
  }

  return defects;
}
