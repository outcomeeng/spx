import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RecordingLaunchRunner, RecordingSuspender } from "@testing/harnesses/session/launch-runner";

describe("launch-runner test harness — properties", () => {
  it("RecordingLaunchRunner records each spawn and RecordingSuspender counts suspend and restore", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.string()), (command, args) => {
        const runner = new RecordingLaunchRunner();
        runner.spawn(command, args);

        expect(runner.commands).toEqual([command]);
        expect(runner.args).toEqual([args]);
        expect(runner.children).toHaveLength(1);

        const child = runner.children[0];
        expect(child.kill()).toBe(true);
        expect(child.killed).toBe(true);

        const suspender = new RecordingSuspender();
        suspender.suspend()();

        expect(suspender.suspendCount).toBe(1);
        expect(suspender.restoreCount).toBe(1);
      }),
    );
  });
});
