import { describe, expect, it } from "vitest";

import {
  arbitraryLifecycleExitSequence,
  arbitraryLifecycleKillSequence,
} from "@testing/generators/process-lifecycle/lifecycle";
import { RecordingChild, RecordingExitController } from "@testing/harnesses/process-lifecycle/lifecycle";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("Property: recording child kill calls", () => {
  it("records every kill value in order, succeeds only on the first kill, and reads killed from the first kill on", () => {
    assertProperty(
      arbitraryLifecycleKillSequence(),
      (values) => {
        const child = new RecordingChild();
        const results: boolean[] = [];
        const killedAfterEachKill: boolean[] = [];

        for (const value of values) {
          results.push(child.kill(value));
          killedAfterEachKill.push(child.killed);
        }

        expect(child.killCalls).toEqual(values);
        expect(results).toEqual(values.map((_, index) => index === 0));
        expect(killedAfterEachKill).toEqual(values.map(() => true));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("Property: recording exit controller", () => {
  it("records every requested exit code in order", () => {
    assertProperty(
      arbitraryLifecycleExitSequence(),
      (codes) => {
        const exitController = new RecordingExitController();

        for (const code of codes) exitController.exit(code);

        expect(exitController.exits).toEqual(codes);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
