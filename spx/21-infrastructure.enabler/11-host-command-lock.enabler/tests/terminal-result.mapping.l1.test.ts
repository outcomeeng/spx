/**
 * Terminal result mapping: each way a guarded run can end maps to one exit code and one result line,
 * with the signal oracle taken from the operating system.
 */

import { constants as osConstants } from "node:os";

import { describe, expect, it } from "vitest";

import {
  NOT_READY_EXIT_CODE,
  OUTCOME_KIND,
  RESULT_STATUS,
  SIGNAL_EXIT_CODE_BASE,
  terminalOutcome,
} from "@/lib/host-command-lock";
import { EXIT_CODE_DOMAIN } from "@testing/generators/process-lifecycle/guarded-supervision";

describe("terminal result mapping", () => {
  it("maps every started child exit code to the same exit code and childExitCode", () => {
    const mismatched = EXIT_CODE_DOMAIN.filter((code) => {
      const { exitCode, result } = terminalOutcome({ kind: OUTCOME_KIND.EXITED, code });
      return exitCode !== code || result.childExitCode !== code || result.started !== true;
    });

    expect(mismatched).toEqual([]);
  });

  it.each(Object.entries(osConstants.signals) as Array<[NodeJS.Signals, number]>)(
    "maps a child ended by %s to 128 plus its number and the signal name",
    (signal, number) => {
      const { exitCode, result } = terminalOutcome({ kind: OUTCOME_KIND.SIGNALED, signal });

      expect(exitCode).toBe(SIGNAL_EXIT_CODE_BASE + number);
      expect(result.signal).toBe(signal);
    },
  );

  it("maps the wait cap to exit 3 with started false and status not_ready", () => {
    const { exitCode, result } = terminalOutcome({ kind: OUTCOME_KIND.NOT_READY });

    expect(exitCode).toBe(NOT_READY_EXIT_CODE);
    expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NOT_READY });
  });

  it.each(
    [
      [OUTCOME_KIND.INVALID_ARGUMENTS, RESULT_STATUS.INVALID_ARGUMENTS],
      [OUTCOME_KIND.UNSUPPORTED_PLATFORM, RESULT_STATUS.UNSUPPORTED_PLATFORM],
      [OUTCOME_KIND.LOCK_FILE_ERROR, RESULT_STATUS.LOCK_FILE_ERROR],
    ] as const,
  )("maps %s to its own status and a nonzero exit before any start", (kind, status) => {
    const { exitCode, result } = terminalOutcome({ kind });

    expect(exitCode).not.toBe(0);
    expect(result.started).toBe(false);
    expect(result.status).toBe(status);
  });

  it("gives the three failure kinds three distinct statuses", () => {
    const statuses = [OUTCOME_KIND.INVALID_ARGUMENTS, OUTCOME_KIND.UNSUPPORTED_PLATFORM, OUTCOME_KIND.LOCK_FILE_ERROR]
      .map((kind) => terminalOutcome({ kind }).result.status);

    expect(new Set(statuses).size).toBe(statuses.length);
  });
});
