import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  EPIPE_EXIT_CODE,
  SIGINT_EXIT_CODE,
  SIGINT_NAME,
  SIGTERM_EXIT_CODE,
  SIGTERM_NAME,
  UNCAUGHT_EXIT_CODE,
} from "@/lib/process-lifecycle";
import { RecordingChild, RecordingExitController } from "@testing/harnesses/process-lifecycle/lifecycle";

function killValue(): fc.Arbitrary<NodeJS.Signals | number> {
  return fc.oneof(
    fc.constant(SIGINT_NAME),
    fc.constant(SIGTERM_NAME),
    fc.constant(EPIPE_EXIT_CODE),
    fc.constant(SIGINT_EXIT_CODE),
    fc.constant(SIGTERM_EXIT_CODE),
    fc.constant(UNCAUGHT_EXIT_CODE),
  );
}

function exitCode(): fc.Arbitrary<number> {
  return fc.oneof(
    fc.constant(EPIPE_EXIT_CODE),
    fc.constant(SIGINT_EXIT_CODE),
    fc.constant(SIGTERM_EXIT_CODE),
    fc.constant(UNCAUGHT_EXIT_CODE),
  );
}

describe("Property: recording child kill calls", () => {
  it("records every kill value in order and succeeds only on the first kill", () => {
    fc.assert(
      fc.property(fc.array(killValue(), { minLength: 1 }), (values) => {
        const child = new RecordingChild();

        const results = values.map((value) => child.kill(value));

        expect(child.killCalls).toEqual(values);
        expect(results).toEqual(values.map((_, index) => index === 0));
        expect(child.killed).toBe(true);
      }),
    );
  });
});

describe("Property: recording exit controller", () => {
  it("records every requested exit code in order", () => {
    fc.assert(
      fc.property(fc.array(exitCode()), (codes) => {
        const exitController = new RecordingExitController();

        for (const code of codes) exitController.exit(code);

        expect(exitController.exits).toEqual(codes);
      }),
    );
  });
});
