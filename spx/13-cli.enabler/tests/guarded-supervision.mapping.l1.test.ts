/**
 * Guarded-supervision exit mapping: the status the supervisor reports for each
 * way a child can end, with the signal oracle taken from the operating system.
 */

import { constants as osConstants } from "node:os";

import { describe, expect, it } from "vitest";

import { guardedExitStatus, SIGNAL_EXIT_CODE_BASE } from "@/lib/process-lifecycle";
import { EXIT_CODE_DOMAIN } from "@testing/generators/process-lifecycle/guarded-supervision";

describe("guarded-supervision exit mapping", () => {
  it.each(Object.entries(osConstants.signals) as Array<[NodeJS.Signals, number]>)(
    "maps a child ended by %s to 128 plus its signal number",
    (signal, number) => {
      expect(guardedExitStatus(null, signal)).toBe(SIGNAL_EXIT_CODE_BASE + number);
    },
  );

  it("maps every child exit code to itself", () => {
    const mismatched = EXIT_CODE_DOMAIN.filter((code) => guardedExitStatus(code, null) !== code);

    expect(mismatched).toEqual([]);
  });

  it("maps a child exit with no code and no signal to a status other than 0", () => {
    expect(guardedExitStatus(null, null)).not.toBe(0);
  });
});
