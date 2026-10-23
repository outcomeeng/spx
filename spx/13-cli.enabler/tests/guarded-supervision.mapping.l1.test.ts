/**
 * Guarded-supervision exit mapping: the status the supervisor reports for each
 * way a child can end, with the signal oracle taken from the operating system.
 */

import { constants as osConstants } from "node:os";

import { describe, expect, it } from "vitest";

import { guardedExitStatus, SIGNAL_EXIT_CODE_BASE } from "@/lib/process-lifecycle";
import { arbitraryExitCode } from "@testing/harnesses/process-lifecycle/guarded-supervision";
import * as fc from "fast-check";

describe("guarded-supervision exit mapping", () => {
  it.each(Object.entries(osConstants.signals) as Array<[NodeJS.Signals, number]>)(
    "maps a child ended by %s to 128 plus its signal number",
    (signal, number) => {
      expect(guardedExitStatus(null, signal)).toBe(SIGNAL_EXIT_CODE_BASE + number);
    },
  );

  it("maps a child exit code to itself", () => {
    for (const code of fc.sample(arbitraryExitCode(), 20)) {
      expect(guardedExitStatus(code, null)).toBe(code);
    }
  });

  it("maps a child exit with no code and no signal to a status other than 0", () => {
    expect(guardedExitStatus(null, null)).not.toBe(0);
  });
});
