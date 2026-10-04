import { describe, expect, it } from "vitest";

import {
  type ChildHandle,
  createHandlers,
  createLifecycleRunner,
  createRegistry,
  SIGINT_NAME,
  SIGTERM_NAME,
} from "@/lib/process-lifecycle";
import {
  arbitraryHandlerInvocationCount,
  arbitraryRegistryOperationScenario,
  arbitrarySpawnRequests,
} from "@testing/generators/process-lifecycle/lifecycle";
import {
  RecordingChild,
  RecordingExitController,
  RecordingLifecycleSpawn,
} from "@testing/harnesses/process-lifecycle/lifecycle";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("Property: registry conservation", () => {
  it("the registry is empty after every added child has been removed", () => {
    assertProperty(arbitraryRegistryOperationScenario(), ({ childPoolSize, operations }) => {
      const registry = createRegistry();
      const children = Array.from({ length: childPoolSize }, () => new RecordingChild());

      for (const operation of operations) {
        const child = children[operation.childIndex];
        if (child === undefined) throw new Error(`operation names child ${operation.childIndex} outside the pool`);
        if (operation.kind === "add") registry.add(child);
        else registry.remove(child);
      }
      for (const child of children) registry.remove(child);

      expect(registry.size).toBe(0);
    }, { level: PROPERTY_LEVEL.L1 });
  });
});

describe("Property: cleanup idempotence", () => {
  it("invoking the SIGINT handler n times kills the tracked child exactly once", () => {
    assertProperty(arbitraryHandlerInvocationCount(), (invocationCount) => {
      const registry = createRegistry();
      const handlers = createHandlers({ registry, exitController: new RecordingExitController() });
      const child = new RecordingChild();
      registry.add(child);

      for (let invocation = 0; invocation < invocationCount; invocation++) handlers.onSigint();

      expect(child.killCalls).toEqual([SIGINT_NAME]);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("invoking the SIGTERM handler n times kills the tracked child exactly once", () => {
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

describe("Property: spawn registration", () => {
  it("every child the lifecycle runner spawns is in the registry when the spawn returns", () => {
    assertProperty(arbitrarySpawnRequests(), (requests) => {
      const registry = createRegistry();
      const spawnPrimitive = new RecordingLifecycleSpawn();
      const runner = createLifecycleRunner({ registry, spawn: spawnPrimitive.spawn });

      for (const request of requests) {
        const returned = runner.spawn(request.command, request.args);
        const registered: ChildHandle[] = [];
        registry.forEach((child) => registered.push(child));

        expect(registered).toContain(returned);
      }
      expect(registry.size).toBe(requests.length);
      expect(spawnPrimitive.children).toHaveLength(requests.length);
    }, { level: PROPERTY_LEVEL.L1 });
  });
});
