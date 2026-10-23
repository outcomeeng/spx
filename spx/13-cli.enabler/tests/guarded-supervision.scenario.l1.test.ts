/**
 * Guarded supervision scenarios.
 *
 * Every scenario runs a supervisor over in-memory doubles for the spawn, the
 * parent's signal listeners, the process-group kill, and the descriptor close.
 * No process starts, no signal is sent, and no file is opened.
 */

import { constants as osConstants } from "node:os";

import { describe, expect, it } from "vitest";

import {
  GUARDED_DESCRIPTOR_NUMBER,
  GUARDED_SIGNALS,
  INHERITED_STDIO,
  lifecycleRegistry,
  SIGNAL_EXIT_CODE_BASE,
} from "@/lib/process-lifecycle";
import {
  arbitraryExitCode,
  arbitrarySpawnFailureMessage,
} from "@testing/generators/process-lifecycle/guarded-supervision";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { createRecordingGuardedContext } from "@testing/harnesses/process-lifecycle/guarded-supervision";

describe("guarded supervision", () => {
  it("reports the child's exit code", async () => {
    const context = createRecordingGuardedContext();
    const code = sampleGeneratedValue(arbitraryExitCode());

    const running = context.supervisor.run(context.request);
    context.child.emitExit(code, null);

    expect(await running).toBe(code);
  });

  it("spawns the child with inherited standard streams and the caller's descriptor", async () => {
    const context = createRecordingGuardedContext();

    const running = context.supervisor.run(context.request);
    context.child.emitExit(0, null);
    await running;

    const [spawned] = context.spawns;
    expect(spawned.command).toBe(context.request.command);
    expect(spawned.args).toEqual(context.request.args);
    expect(spawned.options.stdio).toEqual([
      INHERITED_STDIO,
      INHERITED_STDIO,
      INHERITED_STDIO,
      context.request.descriptor,
    ]);
    expect((spawned.options.stdio as unknown[])[GUARDED_DESCRIPTOR_NUMBER]).toBe(context.request.descriptor);
  });

  it("gives the child a process group of its own", async () => {
    const context = createRecordingGuardedContext();

    const running = context.supervisor.run(context.request);
    context.child.emitExit(0, null);
    await running;

    expect(context.spawns[0].options.detached).toBe(true);
  });

  it.each(GUARDED_SIGNALS)("forwards a received %s to the child's process group once", async (signal) => {
    const context = createRecordingGuardedContext();

    const running = context.supervisor.run(context.request);
    context.target.deliver(signal);
    context.child.emitExit(null, signal);
    await running;

    expect(context.groupKills).toEqual([{ pid: context.child.pid, signal }]);
  });

  it.each(GUARDED_SIGNALS)("reports 128 plus the signal number for a child %s ends", async (signal) => {
    const context = createRecordingGuardedContext();

    const running = context.supervisor.run(context.request);
    context.target.deliver(signal);
    context.child.emitExit(null, signal);

    expect(await running).toBe(SIGNAL_EXIT_CODE_BASE + osConstants.signals[signal]);
  });

  it("suspends the parent's listeners while the child runs and restores them when it exits", async () => {
    const context = createRecordingGuardedContext();

    const running = context.supervisor.run(context.request);
    const suspended = GUARDED_SIGNALS.map((signal) => context.target.listeners(signal));
    context.child.emitExit(0, null);
    await running;

    for (const [index, signal] of GUARDED_SIGNALS.entries()) {
      const originals = context.initialListeners.get(signal) ?? [];
      for (const original of originals) expect(suspended[index]).not.toContain(original);
      expect(context.target.listeners(signal)).toEqual(originals);
    }
  });

  it("closes the supervisor's copy of the descriptor when the child exits", async () => {
    const context = createRecordingGuardedContext();

    const running = context.supervisor.run(context.request);
    context.child.emitExit(0, null);
    await running;

    expect(context.closedDescriptors).toEqual([context.request.descriptor]);
  });

  it("never holds the child in the lifecycle registry", async () => {
    const context = createRecordingGuardedContext();
    const sizeBefore = lifecycleRegistry.size;

    const running = context.supervisor.run(context.request);
    const sizeWhileRunning = lifecycleRegistry.size;
    context.child.emitExit(0, null);
    await running;

    expect([sizeBefore, sizeWhileRunning, lifecycleRegistry.size]).toEqual([0, 0, 0]);
  });

  it("closes the descriptor and restores the listeners when the child cannot be started", async () => {
    const context = createRecordingGuardedContext();

    const running = context.supervisor.run(context.request);
    const failure = new Error(sampleGeneratedValue(arbitrarySpawnFailureMessage()));
    context.child.emitError(failure);

    await expect(running).rejects.toBe(failure);
    expect(context.closedDescriptors).toEqual([context.request.descriptor]);
    for (const signal of GUARDED_SIGNALS) {
      expect(context.target.listeners(signal)).toEqual(context.initialListeners.get(signal));
    }
  });
});
