import { AUDIT_GATE_STATUS, AUDIT_VERDICT_VALUE, type AuditVerdict } from "@/audit/reader";

const VALID_VERDICTS = new Set<string>(Object.values(AUDIT_VERDICT_VALUE));
const VALID_GATE_STATUSES = new Set<string>(Object.values(AUDIT_GATE_STATUS));

export function validateStructure(verdict: AuditVerdict): readonly string[] {
  const defects: string[] = [];

  if (!verdict.header) {
    defects.push("missing required element: <header>");
    return defects;
  }

  if (!verdict.header.spec_node) {
    defects.push("missing required element: <spec_node>");
  }

  if (!verdict.header.verdict) {
    defects.push("missing required element: <verdict> in <header>");
  } else if (!VALID_VERDICTS.has(verdict.header.verdict)) {
    defects.push(
      `invalid enum value: verdict "${verdict.header.verdict}" is not one of APPROVED, REJECT`,
    );
  }

  if (!verdict.header.timestamp) {
    defects.push("missing required element: <timestamp>");
  }

  if (verdict.gates.length === 0) {
    defects.push("missing required element: at least one <gate> in <gates>");
  }

  for (const gate of verdict.gates) {
    const label = gate.name ? `gate "${gate.name}"` : "gate";

    if (gate.status !== undefined && !VALID_GATE_STATUSES.has(gate.status)) {
      defects.push(
        `invalid enum value: ${label} status "${gate.status}" is not one of PASS, FAIL, SKIPPED`,
      );
    }

    if (gate.count !== undefined) {
      const declared = parseInt(gate.count, 10);
      const actual = gate.findings.length;
      if (isNaN(declared) || declared !== actual) {
        defects.push(
          `count mismatch: ${label} declares count="${gate.count}" but has ${actual} finding(s)`,
        );
      }
    }
  }

  return defects;
}
