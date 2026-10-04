import { describe, expect, it } from "vitest";

import { createHandlers, createRegistry, SIGINT_NAME, SIGTERM_NAME } from "@/lib/process-lifecycle";
import {
  arbitraryMultipleTrackedChildCount,
  LIFECYCLE_EXIT_ORACLE,
} from "@testing/generators/process-lifecycle/lifecycle";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { RecordingChild, RecordingExitController } from "@testing/harnesses/process-lifecycle/lifecycle";

describe("Scenario: SIGINT with one tracked child", () => {
  it("forwards SIGINT to the registered child and exits with the SIGINT exit code", () => {
    const registry = createRegistry();
    const exitController = new RecordingExitController();
    const handlers = createHandlers({ registry, exitController });
    const child = new RecordingChild();
    registry.add(child);

    handlers.onSigint();

    expect(child.killCalls).toEqual([SIGINT_NAME]);
    expect(exitController.exits).toEqual([LIFECYCLE_EXIT_ORACLE.SIGINT]);
  });
});

describe("Scenario: SIGTERM with multiple tracked children", () => {
  it("forwards SIGTERM to every registered child and exits with the SIGTERM exit code", () => {
    const registry = createRegistry();
    const exitController = new RecordingExitController();
    const handlers = createHandlers({ registry, exitController });
    const children = Array.from(
      { length: sampleGeneratedValue(arbitraryMultipleTrackedChildCount()) },
      () => new RecordingChild(),
    );
    for (const child of children) registry.add(child);

    handlers.onSigterm();

    for (const child of children) {
      expect(child.killCalls).toEqual([SIGTERM_NAME]);
    }
    expect(exitController.exits).toEqual([LIFECYCLE_EXIT_ORACLE.SIGTERM]);
  });
});

describe("Scenario: uncaught exception with one tracked child", () => {
  it("kills the registered child and exits with a non-zero code", () => {
    const registry = createRegistry();
    const exitController = new RecordingExitController();
    const handlers = createHandlers({ registry, exitController });
    const child = new RecordingChild();
    registry.add(child);

    handlers.onUncaught(new Error());

    expect(child.killed).toBe(true);
    expect(exitController.exits).toHaveLength(1);
    expect(exitController.exits[0]).not.toBe(0);
  });
});
