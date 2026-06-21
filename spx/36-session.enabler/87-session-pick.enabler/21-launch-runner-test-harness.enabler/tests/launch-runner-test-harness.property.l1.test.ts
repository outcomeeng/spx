import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RecordingLaunchRunner, RecordingSuspender } from "@testing/harnesses/session/launch-runner";

describe("launch-runner test harness — properties", () => {
  it("RecordingLaunchRunner appends each spawn in order and RecordingSuspender counts suspend and restore", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.string(), fc.array(fc.string())), { minLength: 2 }), (spawns) => {
        const runner = new RecordingLaunchRunner();
        for (const [command, args] of spawns) {
          runner.spawn(command, args);
        }

        expect(runner.commands).toEqual(spawns.map(([command]) => command));
        expect(runner.args).toEqual(spawns.map(([, args]) => args));
        expect(runner.options).toEqual(spawns.map(() => ({})));
        expect(runner.children).toHaveLength(spawns.length);

        const lastChild = runner.children[runner.children.length - 1];
        expect(lastChild.kill()).toBe(true);
        expect(lastChild.killed).toBe(true);

        const suspender = new RecordingSuspender();
        suspender.suspend()();

        expect(suspender.suspendCount).toBe(1);
        expect(suspender.restoreCount).toBe(1);
      }),
    );
  });
});
