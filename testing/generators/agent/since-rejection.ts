import {
  AGENT_CLI_ERROR_PREFIX,
  AGENT_SINCE_ACCEPTED_FORM,
  AGENT_SINCE_DIAGNOSTIC,
  type AgentSinceDiagnostic,
} from "@/interfaces/cli/agent";

export const SINCE_REJECTION_VIOLATION = {
  DIAGNOSTIC_LINE_COUNT: "diagnostic-line-count",
  MISSING_ERROR_PREFIX: "missing-error-prefix",
  DOUBLED_ERROR_PREFIX: "doubled-error-prefix",
  MISSING_DURATION: "missing-duration",
  MISSING_DIAGNOSTIC: "missing-diagnostic",
  MISSING_ACCEPTED_FORM_HINT: "missing-accepted-form-hint",
} as const;

export type SinceRejectionViolation = (typeof SINCE_REJECTION_VIOLATION)[keyof typeof SINCE_REJECTION_VIOLATION];

export interface RejectedSinceDiagnosticObservation {
  readonly stderr: string;
  readonly sanitizedDuration: string;
  readonly expectedDiagnostic: AgentSinceDiagnostic;
}

export function sinceRejectionViolations(
  attempt: RejectedSinceDiagnosticObservation,
): readonly SinceRejectionViolation[] {
  const diagnosticLines = attempt.stderr.split("\n").filter((line) => line.includes(AGENT_CLI_ERROR_PREFIX));
  if (diagnosticLines.length !== 1) {
    return [SINCE_REJECTION_VIOLATION.DIAGNOSTIC_LINE_COUNT];
  }
  const [diagnosticLine] = diagnosticLines;
  const violations: SinceRejectionViolation[] = [];
  if (!diagnosticLine.startsWith(AGENT_CLI_ERROR_PREFIX)) {
    violations.push(SINCE_REJECTION_VIOLATION.MISSING_ERROR_PREFIX);
  }
  if (diagnosticLine.slice(AGENT_CLI_ERROR_PREFIX.length).includes(AGENT_CLI_ERROR_PREFIX)) {
    violations.push(SINCE_REJECTION_VIOLATION.DOUBLED_ERROR_PREFIX);
  }
  if (!diagnosticLine.includes(attempt.sanitizedDuration)) {
    violations.push(SINCE_REJECTION_VIOLATION.MISSING_DURATION);
  }
  if (!diagnosticLine.includes(attempt.expectedDiagnostic)) {
    violations.push(SINCE_REJECTION_VIOLATION.MISSING_DIAGNOSTIC);
  }
  if (
    attempt.expectedDiagnostic === AGENT_SINCE_DIAGNOSTIC.MISSING_UNIT
    && !diagnosticLine.includes(AGENT_SINCE_ACCEPTED_FORM)
  ) {
    violations.push(SINCE_REJECTION_VIOLATION.MISSING_ACCEPTED_FORM_HINT);
  }
  return violations;
}
