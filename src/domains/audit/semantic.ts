import { AUDIT_GATE_STATUS, AUDIT_VERDICT_VALUE, AuditVerdict } from "./reader";

export function validateSemantics(verdict: AuditVerdict): readonly string[] {
  const defects: string[] = [];

  const hasFail = verdict.gates.some((g) => g.status === AUDIT_GATE_STATUS.FAIL);
  const hasSkipped = verdict.gates.some((g) => g.status === AUDIT_GATE_STATUS.SKIPPED);

  if (verdict.header?.verdict === AUDIT_VERDICT_VALUE.APPROVED && (hasFail || hasSkipped)) {
    defects.push("incoherent verdict: APPROVED but at least one gate is not PASS");
  } else if (verdict.header?.verdict === AUDIT_VERDICT_VALUE.REJECT && !hasFail && !hasSkipped) {
    defects.push("incoherent verdict: REJECT but all gates are PASS");
  }

  for (const gate of verdict.gates) {
    const label = gate.name ? `gate "${gate.name}"` : "gate";

    if (gate.status === AUDIT_GATE_STATUS.FAIL && gate.findings.length === 0) {
      defects.push(`failed gate has no findings: ${label}`);
    }

    if (gate.status === AUDIT_GATE_STATUS.SKIPPED && !gate.skipped_reason) {
      defects.push(`skipped gate missing reason: ${label}`);
    }
  }

  return defects;
}
