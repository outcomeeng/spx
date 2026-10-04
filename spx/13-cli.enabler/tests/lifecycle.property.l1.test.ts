import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type ChildHandle,
  createHandlers,
  createLifecycleRunner,
  createRegistry,
  type LifecycleSpawn,
  SIGINT_NAME,
  SIGTERM_NAME,
} from "@/lib/process-lifecycle";
import { RecordingChild, RecordingExitController } from "@testing/harnesses/process-lifecycle/lifecycle";

const childPoolSize = 10;
const maxOperationCount = 50;
const maxHandlerInvocations = 10;
const maxSpawnCount = 10;

type RegistryOp =
  | { kind: "add"; index: number }
  | { kind: "remove"; index: number };

const registryOpArbitrary = fc.oneof(
  fc.record({
    kind: fc.constant("add" as const),
    index: fc.integer({ min: 0, max: childPoolSize - 1 }),
  }),
  fc.record({
    kind: fc.constant("remove" as const),
    index: fc.integer({ min: 0, max: childPoolSize - 1 }),
  }),
);

describe("Property: registry conservation", () => {
  it("the registry is empty after every added child has been removed", () => {
    fc.assert(
      fc.property(
        fc.array(registryOpArbitrary, { maxLength: maxOperationCount }),
        (operations: readonly RegistryOp[]) => {
          const registry = createRegistry();
          const children = Array.from({ length: childPoolSize }, () => new RecordingChild());

          for (const op of operations) {
            const child = children[op.index];
            if (child === undefined) continue;
            if (op.kind === "add") registry.add(child);
            else registry.remove(child);
          }

          for (const child of children) registry.remove(child);

          expect(registry.size).toBe(0);
        },
      ),
    );
  });
});

describe("Property: cleanup idempotence", () => {
  it("invoking onSigint() N times kills each registered child exactly once", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: maxHandlerInvocations }), (invocationCount) => {
        const registry = createRegistry();
        const exitController = new RecordingExitController();
        const handlers = createHandlers({ registry, exitController });
        const child = new RecordingChild();
        registry.add(child);

        for (let i = 0; i < invocationCount; i++) handlers.onSigint();

        expect(child.killCalls).toEqual([SIGINT_NAME]);
      }),
    );
  });

  it("invoking onSigterm() N times kills each registered child exactly once", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: maxHandlerInvocations }), (invocationCount) => {
        const registry = createRegistry();
        const exitController = new RecordingExitController();
        const handlers = createHandlers({ registry, exitController });
        const child = new RecordingChild();
        registry.add(child);

        for (let i = 0; i < invocationCount; i++) handlers.onSigterm();

        expect(child.killCalls).toEqual([SIGTERM_NAME]);
      }),
    );
  });
});

describe("Property: lifecycle runner registers every spawned child", () => {
  it("for every spawn count N, registry.size equals N immediately after N spawns", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: maxSpawnCount }), (spawnCount) => {
        const registry = createRegistry();
        const fakeSpawn = ((..._args: readonly unknown[]): ChildHandle => {
          return new RecordingChild();
        }) as unknown as LifecycleSpawn;

        const runner = createLifecycleRunner({ registry, spawn: fakeSpawn });
        for (let i = 0; i < spawnCount; i++) {
          runner.spawn("test-binary", []);
        }

        expect(registry.size).toBe(spawnCount);
      }),
    );
  });
});
