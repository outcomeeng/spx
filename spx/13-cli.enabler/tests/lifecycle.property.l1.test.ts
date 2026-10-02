import { describe, expect, it } from "vitest";

import {
  createHandlers,
  createLifecycleRunner,
  createRegistry,
  SIGINT_NAME,
  SIGTERM_NAME,
} from "@/lib/process-lifecycle";
import {
  arbitraryHandlerInvocationCount,
  arbitraryRegistryOperationSequence,
  arbitrarySpawnRequests,
  REGISTRY_OPERATION,
} from "@testing/generators/process-lifecycle/lifecycle";
import {
  RecordingChild,
  RecordingExitController,
  RecordingLifecycleSpawn,
  trackedChildren,
} from "@testing/harnesses/process-lifecycle/lifecycle";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("Property: registry conservation", () => {
  it("the registry is empty after every added child has been removed", () => {
    assertProperty(arbitraryRegistryOperationSequence(), ({ poolSize, operations }) => {
      const registry = createRegistry();
      const children = Array.from({ length: poolSize }, () => new RecordingChild());

      for (const operation of operations) {
        const child = children[operation.index];
        if (child === undefined) continue;
        if (operation.kind === REGISTRY_OPERATION.ADD) registry.add(child);
        else registry.remove(child);
      }
      for (const child of children) registry.remove(child);

      expect(registry.size).toBe(0);
    }, { level: PROPERTY_LEVEL.L1 });
  });
});

describe("Property: cleanup idempotence", () => {
  it("invoking onSigint() N times kills each registered child exactly once", () => {
    assertProperty(arbitraryHandlerInvocationCount(), (invocationCount) => {
      const registry = createRegistry();
      const handlers = createHandlers({ registry, exitController: new RecordingExitController() });
      const child = new RecordingChild();
      registry.add(child);

      for (let invocation = 0; invocation < invocationCount; invocation++) handlers.onSigint();

      expect(child.killCalls).toEqual([SIGINT_NAME]);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("invoking onSigterm() N times kills each registered child exactly once", () => {
    assertProperty(arbitraryHandlerInvocationCount(), (invocationCount) => {
      const registry = createRegistry();
      const handlers = createHandlers({ registry, exitController: new RecordingExitController() });
      const child = new RecordingChild();
      registry.add(child);

      for (let invocation = 0; invocation < invocationCount; invocation++) handlers.onSigterm();

      expect(child.killCalls).toEqual([SIGTERM_NAME]);
    }, { level: PROPERTY_LEVEL.L1 });
  });
});

describe("Property: lifecycle runner registers every spawned child", () => {
  it("every handle a spawn returns is tracked by the registry when the spawn returns", () => {
    assertProperty(arbitrarySpawnRequests(), (requests) => {
      const registry = createRegistry();
      const recordingSpawn = new RecordingLifecycleSpawn();
      const runner = createLifecycleRunner({ registry, spawn: recordingSpawn.spawn });

      for (const { command, args } of requests) {
        const child = runner.spawn(command, args);
        expect(trackedChildren(registry)).toContain(child);
      }

      expect(trackedChildren(registry)).toEqual(recordingSpawn.children);
    }, { level: PROPERTY_LEVEL.L1 });
  });
});
