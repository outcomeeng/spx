import type { ChildProcess, SpawnOptions } from "node:child_process";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";

interface SpawnCallInput {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

function spawnCallInput(): fc.Arbitrary<SpawnCallInput> {
  return fc.record({
    command: arbitraryDomainLiteral(),
    args: fc.array(arbitraryDomainLiteral()),
    cwd: arbitraryDomainLiteral(),
  });
}

function toSpawnOptions(input: SpawnCallInput): SpawnOptions {
  return { cwd: input.cwd };
}

describe("Property: recording spawn-options runner", () => {
  it("records commands, args, options, and children in spawn order", () => {
    fc.assert(
      fc.property(fc.array(spawnCallInput()), (inputs) => {
        const runner = new RecordingSpawnOptionsRunner();
        const returnedChildren: ChildProcess[] = [];

        for (const input of inputs) {
          returnedChildren.push(runner.spawn(input.command, input.args, toSpawnOptions(input)));
        }

        expect(runner.commands).toEqual(inputs.map((input) => input.command));
        expect(runner.args).toEqual(inputs.map((input) => [...input.args]));
        expect(runner.options).toEqual(inputs.map(toSpawnOptions));
        expect(runner.children.map((child) => child.asChildProcess())).toEqual(returnedChildren);
        expect(runner.children).toHaveLength(inputs.length);
        expect(runner.spawnOptions).toEqual(
          inputs.length === 0 ? undefined : toSpawnOptions(inputs[inputs.length - 1]),
        );
      }),
    );
  });
});
