import type { RecordedTestRun } from "@/commands/test";
import { SUCCESS_EXIT_CODE } from "@/domains/test";
import {
  authoredText,
  externalValue,
  joinTerminalText,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";
import { TEST_RUN_STATE_STATUS, type TestRunStateStatus } from "@/test/run-state";

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
  SKIPPED_TESTS: "skippedTests",
  UNMATCHED: "unmatched",
  UNRESOLVED_TARGETS: "unresolvedTargets",
  UNRESOLVED_CHANGED_SOURCE_FILES: "unresolvedChangedSourceFiles",
} as const;

const NEWLINE = "\n";
const INDENT = "  ";
const DETAIL_INDENT = "    ";
const MAX_LISTED_PATHS = 8;
const OMITTED_LABEL = "more";

/**
 * The listed paths plus the product's own count of what it withheld. A path came from the runner
 * or the caller's argv, so it is a reading; the overflow line is spx counting, so it is authored.
 */
function formatPathList(paths: readonly string[]): readonly TerminalText[] {
  const listed = paths.slice(0, MAX_LISTED_PATHS).map((path) => externalValue(path));
  const omitted = paths.length - listed.length;
  if (omitted === 0) return listed;
  return [...listed, authoredText(`${omitted} ${OMITTED_LABEL}`)];
}

function appendPathList(lines: TerminalText[], label: string, paths: readonly string[]): void {
  lines.push(authoredText(`${INDENT}${label}:`));
  for (const path of formatPathList(paths)) {
    lines.push(terminal`${authoredText(DETAIL_INDENT)}${path}`);
  }
}

function failingReportPaths(report: RecordedTestRun["dispatch"]["reports"][number]): readonly string[] {
  if (report.output?.failingTestPaths !== undefined && report.output.failingTestPaths.length > 0) {
    return report.output.failingTestPaths;
  }
  return report.testPaths;
}

function unreportedGroups(run: RecordedTestRun): typeof run.dispatch.groups {
  const reportedRunnerIds = new Set(run.dispatch.reports.map((report) => report.runnerId));
  return run.dispatch.groups.filter((group) => !reportedRunnerIds.has(group.language.name));
}

function summaryStatus(run: RecordedTestRun): TestRunStateStatus {
  if (run.dispatch.exitCode !== SUCCESS_EXIT_CODE) {
    return TEST_RUN_STATE_STATUS.FAILED;
  }
  return run.recorded.status;
}

/**
 * The agent-mode run report. Every label, indent, count, exit code, and status is the product's
 * own speech; the state-file path, runner identity, and test paths were read from the filesystem
 * and the runner, so each is escaped where it is embedded. A runner controls the bytes in a
 * failing test's path, and this report prints them.
 */
export function formatAgentTestOutput(run: RecordedTestRun): TerminalText {
  const lines: TerminalText[] = [
    authoredText(AGENT_TEST_OUTPUT_TEXT.HEADER),
    authoredText(`${AGENT_TEST_OUTPUT_TEXT.STATUS}: ${summaryStatus(run)}`),
    authoredText(`${AGENT_TEST_OUTPUT_TEXT.EXIT_CODE}: ${run.dispatch.exitCode}`),
    terminal`${authoredText(`${AGENT_TEST_OUTPUT_TEXT.STATE_FILE}: `)}${externalValue(run.runFile.runFilePath)}`,
  ];

  for (const report of run.dispatch.reports) {
    lines.push(
      terminal`${authoredText(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: `)}${externalValue(report.runnerId)}`,
      authoredText(`${INDENT}${AGENT_TEST_OUTPUT_TEXT.EXIT_CODE}: ${report.exitCode}`),
      authoredText(`${INDENT}${AGENT_TEST_OUTPUT_TEXT.TESTS}: ${report.testPaths.length}`),
    );
    if (report.output !== undefined) {
      lines.push(
        terminal`${authoredText(`${INDENT}${AGENT_TEST_OUTPUT_TEXT.STDOUT}: `)}${
          externalValue(report.output.stdoutPath)
        }`,
        terminal`${authoredText(`${INDENT}${AGENT_TEST_OUTPUT_TEXT.STDERR}: `)}${
          externalValue(report.output.stderrPath)
        }`,
      );
    }
    if (report.exitCode !== SUCCESS_EXIT_CODE) {
      appendPathList(
        lines,
        AGENT_TEST_OUTPUT_TEXT.FAILING_TESTS,
        failingReportPaths(report),
      );
    }
  }

  for (const group of unreportedGroups(run)) {
    lines.push(
      terminal`${authoredText(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: `)}${externalValue(group.language.name)}`,
    );
    appendPathList(lines, AGENT_TEST_OUTPUT_TEXT.SKIPPED_TESTS, group.testPaths);
  }

  if (run.dispatch.unresolvedTargets.length > 0) {
    appendPathList(lines, AGENT_TEST_OUTPUT_TEXT.UNRESOLVED_TARGETS, run.dispatch.unresolvedTargets);
  }

  if ((run.dispatch.unresolvedChangedSourceFiles ?? []).length > 0) {
    appendPathList(
      lines,
      AGENT_TEST_OUTPUT_TEXT.UNRESOLVED_CHANGED_SOURCE_FILES,
      run.dispatch.unresolvedChangedSourceFiles ?? [],
    );
  }

  if (run.dispatch.unmatched.length > 0) {
    appendPathList(lines, AGENT_TEST_OUTPUT_TEXT.UNMATCHED, run.dispatch.unmatched);
  }

  return terminal`${joinTerminalText(NEWLINE, lines)}${authoredText(NEWLINE)}`;
}
