import { describe, expect, it } from "vitest";

import {
  createHandlers,
  createRegistry,
  SIGINT_EXIT_CODE,
  SIGINT_NAME,
  SIGTERM_EXIT_CODE,
  SIGTERM_NAME,
} from "@/lib/process-lifecycle";
import { RecordingChild, RecordingExitController } from "@testing/harnesses/process-lifecycle/lifecycle";

describe("Scenario: SIGINT with one tracked child", () => {
  it("forwards SIGINT to the registered child and exits with SIGINT_EXIT_CODE", () => {
    const registry = createRegistry();
    const exitController = new RecordingExitController();
    const handlers = createHandlers({ registry, exitController });
    const child = new RecordingChild();
    registry.add(child);

    handlers.onSigint();

    expect(child.killCalls).toEqual([SIGINT_NAME]);
    expect(exitController.exits).toEqual([SIGINT_EXIT_CODE]);
  });
});

describe("Scenario: SIGTERM with multiple tracked children", () => {
  it("forwards SIGTERM to every registered child and exits with SIGTERM_EXIT_CODE", () => {
    const registry = createRegistry();
    const exitController = new RecordingExitController();
    const handlers = createHandlers({ registry, exitController });
    const childCount = 3;
    const children = Array.from({ length: childCount }, () => new RecordingChild());
    for (const child of children) registry.add(child);

    handlers.onSigterm();

    for (const child of children) {
      expect(child.killCalls).toEqual([SIGTERM_NAME]);
    }
    expect(exitController.exits).toEqual([SIGTERM_EXIT_CODE]);
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
