import type { ChildProcess, SpawnOptions } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  arbitraryValidationSpawnCallSequence,
  type ValidationSpawnCall,
} from "@testing/generators/validation/subprocess";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";

function toSpawnOptions(call: ValidationSpawnCall): SpawnOptions {
  return { cwd: call.cwd };
}

describe("Property: recording spawn-options runner", () => {
  it("records each command, argument list, options object, and returned child in call order", () => {
    assertProperty(
      arbitraryValidationSpawnCallSequence(),
      (calls) => {
        const runner = new RecordingSpawnOptionsRunner();
        const returnedChildren: ChildProcess[] = [];
        const latestOptions: Array<SpawnOptions | undefined> = [runner.spawnOptions];

        for (const call of calls) {
          returnedChildren.push(runner.spawn(call.command, call.args, toSpawnOptions(call)));
          latestOptions.push(runner.spawnOptions);
        }

        expect(runner.commands).toEqual(calls.map((call) => call.command));
        expect(runner.args).toEqual(calls.map((call) => [...call.args]));
        expect(runner.options).toEqual(calls.map(toSpawnOptions));
        expect(runner.children.map((child) => child.asChildProcess())).toEqual(returnedChildren);
        expect(latestOptions).toEqual([undefined, ...calls.map(toSpawnOptions)]);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
