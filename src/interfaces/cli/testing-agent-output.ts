import { SUCCESS_EXIT_CODE } from "@/domains/testing";
import type { RecordedTestRun } from "@/commands/testing";

export const AGENT_TEST_OUTPUT_TEXT = {
  HEADER: "spx test --agent",
  STATUS: "status",
  EXIT_CODE: "exitCode",
  STATE_FILE: "stateFile",
  RUNNER: "runner",
  TESTS: "tests",
  STDOUT: "stdout",
  STDERR: "stderr",
  FAILING_TESTS: "failingTests",
  UNMATCHED: "unmatched",
} as const;

const NEWLINE = "\n";
const INDENT = "  ";
const DETAIL_INDENT = "    ";
const MAX_LISTED_PATHS = 8;
const OMITTED_LABEL = "more";

function formatPathList(paths: readonly string[]): readonly string[] {
  const listed = paths.slice(0, MAX_LISTED_PATHS);
  const omitted = paths.length - listed.length;
  if (omitted === 0) return listed;
  return [...listed, `${omitted} ${OMITTED_LABEL}`];
}

function appendPathList(lines: string[], label: string, paths: readonly string[]): void {
  lines.push(`${INDENT}${label}:`);
  for (const path of formatPathList(paths)) {
    lines.push(`${DETAIL_INDENT}${path}`);
  }
}

export function formatAgentTestOutput(run: RecordedTestRun): string {
  const lines = [
    AGENT_TEST_OUTPUT_TEXT.HEADER,
    `${AGENT_TEST_OUTPUT_TEXT.STATUS}: ${run.recorded.status}`,
    `${AGENT_TEST_OUTPUT_TEXT.EXIT_CODE}: ${run.dispatch.exitCode}`,
    `${AGENT_TEST_OUTPUT_TEXT.STATE_FILE}: ${run.runFile.runFilePath}`,
  ];

  for (const report of run.dispatch.reports) {
    lines.push(
      `${AGENT_TEST_OUTPUT_TEXT.RUNNER}: ${report.runnerId}`,
      `${INDENT}${AGENT_TEST_OUTPUT_TEXT.EXIT_CODE}: ${report.exitCode}`,
      `${INDENT}${AGENT_TEST_OUTPUT_TEXT.TESTS}: ${report.testPaths.length}`,
    );
    if (report.output !== undefined) {
      lines.push(
        `${INDENT}${AGENT_TEST_OUTPUT_TEXT.STDOUT}: ${report.output.stdoutPath}`,
        `${INDENT}${AGENT_TEST_OUTPUT_TEXT.STDERR}: ${report.output.stderrPath}`,
      );
    }
    if (report.exitCode !== SUCCESS_EXIT_CODE) {
      appendPathList(
        lines,
        AGENT_TEST_OUTPUT_TEXT.FAILING_TESTS,
        report.output?.failingTestPaths ?? report.testPaths,
      );
    }
  }

  if (run.dispatch.unmatched.length > 0) {
    appendPathList(lines, AGENT_TEST_OUTPUT_TEXT.UNMATCHED, run.dispatch.unmatched);
  }

  return `${lines.join(NEWLINE)}${NEWLINE}`;
}
