/**
 * Guarded supervision scenarios.
 *
 * Real-child scenarios run the production guarded supervisor over a real Node
 * child and a real descriptor; recording scenarios run a supervisor over
 * doubles for the spawn, the parent's signal listeners, the process-group
 * kill, and the descriptor close.
 */

import { constants as osConstants } from "node:os";

import { describe, expect, it } from "vitest";

import {
  GUARDED_DESCRIPTOR_NUMBER,
  GUARDED_SIGNALS,
  INHERITED_STDIO,
  SIGNAL_EXIT_CODE_BASE,
} from "@/lib/process-lifecycle";
import {
  arbitraryExitCode,
  arbitrarySpawnFailureMessage,
} from "@testing/generators/process-lifecycle/guarded-supervision";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  createRecordingGuardedContext,
  parseGrandchildPid,
  parseIdentityReport,
  processEnds,
  REAL_CHILD_PROGRAM,
  superviseRealChild,
} from "@testing/harnesses/process-lifecycle/guarded-supervision";

describe("guarded supervision", () => {
  it("reports the child's exit code", async () => {
    const code = sampleGeneratedValue(arbitraryExitCode());

    const run = await superviseRealChild(REAL_CHILD_PROGRAM.exitWith(code));

    expect(run.status).toBe(code);
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

  it("gives the child the descriptor at the reserved number and a process group of its own", async () => {
    const run = await superviseRealChild(REAL_CHILD_PROGRAM.reportIdentity);

    const { pid, pgid } = parseIdentityReport(run.report);
    expect(Number.isInteger(pid)).toBe(true);
    expect(pgid).toBe(pid);
  });

  it.each(GUARDED_SIGNALS)("forwards a received %s to the child's process group once", async (signal) => {
    const context = createRecordingGuardedContext();

    const running = context.supervisor.run(context.request);
    context.target.deliver(signal);
    context.child.emitExit(null, signal);
    await running;

    expect(context.groupKills).toEqual([{ pid: context.child.pid, signal }]);
  });

  it.each(GUARDED_SIGNALS)(
    "reaches the whole process group of the production supervisor's child when it receives %s",
    async (signal) => {
      const run = await superviseRealChild(REAL_CHILD_PROGRAM.awaitSignalWithGrandchild, {
        deliverWhenReady: signal,
      });

      expect(await processEnds(parseGrandchildPid(run.report))).toBe(true);
    },
  );

  it.each(GUARDED_SIGNALS)("reports 128 plus the signal number for a child %s ends", async (signal) => {
    const run = await superviseRealChild(REAL_CHILD_PROGRAM.awaitSignal, { deliverWhenReady: signal });

    expect(run.status).toBe(SIGNAL_EXIT_CODE_BASE + osConstants.signals[signal]);
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

  it("restores the production parent's listeners when the child exits", async () => {
    const run = await superviseRealChild(REAL_CHILD_PROGRAM.exitWith(sampleGeneratedValue(arbitraryExitCode())));

    expect(run.listenersAfter).toEqual(run.listenersBefore);
  });

  it("closes the supervisor's copy of the descriptor when the child exits", async () => {
    const context = createRecordingGuardedContext();

    const running = context.supervisor.run(context.request);
    context.child.emitExit(0, null);
    await running;

    expect(context.closedDescriptors).toEqual([context.request.descriptor]);
  });

  it("closes the production supervisor's descriptor when the child exits", async () => {
    const run = await superviseRealChild(REAL_CHILD_PROGRAM.exitWith(sampleGeneratedValue(arbitraryExitCode())));

    expect(run.descriptorOpen).toBe(false);
  });

  it("never holds the child in the lifecycle registry", async () => {
    const run = await superviseRealChild(REAL_CHILD_PROGRAM.exitWith(sampleGeneratedValue(arbitraryExitCode())));

    expect([run.registrySizeWhileRunning, run.registrySizeAfter]).toEqual([0, 0]);
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
