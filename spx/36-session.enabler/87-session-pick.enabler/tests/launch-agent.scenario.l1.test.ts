/**
 * Launch-agent exit-status scenarios.
 *
 * Drives `launchAgent` through a recording ProcessRunner whose child the test
 * makes emit `exit` or `error`, and a recording suspender that records the
 * signal suspend/restore pairing. The launch command and the exit statuses are
 * generated; every expectation is derived from the generated input or the
 * documented fallback status. `launchAgent` attaches its listeners
 * synchronously, so the child the runner recorded can be driven the moment the
 * promise is pending.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildPickupCommand, type LaunchCommand, PICKER_RUNTIME } from "@/domains/session/pick-model";
import { launchAgent } from "@/interfaces/cli/session/pick/launch-agent";
import { arbitrarySessionId } from "@testing/generators/session/session";
import { RecordingLaunchRunner, RecordingSuspender } from "@testing/harnesses/session/launch-runner";

/** Draw a single value from an arbitrary for an example-based scenario. */
function sample<T>(arbitrary: fc.Arbitrary<T>): T {
  return fc.sample(arbitrary, 1)[0];
}

/** A generated launch command — any runtime, auto-continue flag, and session id. */
function sampleCommand(): LaunchCommand {
  const runtime = sample(fc.constantFrom(...Object.values(PICKER_RUNTIME)));
  const autoContinue = sample(fc.boolean());
  return buildPickupCommand(runtime, autoContinue, sample(arbitrarySessionId()));
}

describe("launchAgent exit status", () => {
  it("suspends signals, then resolves with the status the agent exits with, restoring signals", async () => {
    const status = sample(fc.integer({ min: 0, max: 255 }));
    const runner = new RecordingLaunchRunner();
    const suspender = new RecordingSuspender();

    const pending = launchAgent(runner, suspender, sampleCommand());
    expect(suspender.suspendCount).toBe(1);
    expect(suspender.restoreCount).toBe(0);
    runner.children[0].emitExit(status);

    expect(await pending).toBe(status);
    expect(suspender.restoreCount).toBe(1);
  });

  it("resolves a non-zero status when the agent exits without one, restoring signals", async () => {
    const runner = new RecordingLaunchRunner();
    const suspender = new RecordingSuspender();

    const pending = launchAgent(runner, suspender, sampleCommand());
    runner.children[0].emitExit(null);

    expect(await pending).toBeGreaterThan(0);
    expect(suspender.restoreCount).toBe(1);
  });

  it("resolves a non-zero status when the agent binary cannot be spawned, restoring signals", async () => {
    const runner = new RecordingLaunchRunner();
    const suspender = new RecordingSuspender();

    const pending = launchAgent(runner, suspender, sampleCommand());
    runner.children[0].emitError(new Error(sample(fc.string())));

    expect(await pending).toBeGreaterThan(0);
    expect(suspender.restoreCount).toBe(1);
  });

  it("settles once when the agent emits both exit and error, restoring signals a single time", async () => {
    const status = sample(fc.integer({ min: 0, max: 255 }));
    const runner = new RecordingLaunchRunner();
    const suspender = new RecordingSuspender();

    const pending = launchAgent(runner, suspender, sampleCommand());
    runner.children[0].emitExit(status);
    runner.children[0].emitError(new Error(sample(fc.string())));

    expect(await pending).toBe(status);
    expect(suspender.restoreCount).toBe(1);
  });
});
