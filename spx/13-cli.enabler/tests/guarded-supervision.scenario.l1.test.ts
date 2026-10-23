/**
 * Guarded supervision scenarios.
 *
 * Real-child scenarios run the supervisor over a real Node child and a real
 * descriptor; recording scenarios run it over doubles for the spawn, the
 * parent's signal listeners, the process-group kill, and the descriptor close.
 */

import { constants as osConstants } from "node:os";

import { describe, expect, it } from "vitest";

import {
  GUARDED_DESCRIPTOR_NUMBER,
  GUARDED_SIGNALS,
  guardedExitStatus,
  INHERITED_STDIO,
  SIGNAL_EXIT_CODE_BASE,
} from "@/lib/process-lifecycle";
import {
  arbitraryExitCode,
  arbitraryGuardedSignal,
  createRecordingGuardedContext,
  parseIdentityReport,
  REAL_CHILD_PROGRAM,
  superviseRealChild,
} from "@testing/harnesses/process-lifecycle/guarded-supervision";
import * as fc from "fast-check";

function sample<T>(arbitrary: fc.Arbitrary<T>): T {
  return fc.sample(arbitrary, 1)[0];
}

describe("guarded supervision", () => {
  it("reports the child's exit code", async () => {
    const code = sample(arbitraryExitCode());

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

  it("forwards a received signal to the child's process group once", async () => {
    const context = createRecordingGuardedContext();
    const signal = sample(arbitraryGuardedSignal());

    const running = context.supervisor.run(context.request);
    context.target.deliver(signal);
    context.child.emitExit(null, signal);
    await running;

    expect(context.groupKills).toEqual([{ pid: context.child.pid, signal }]);
  });

  it("reports 128 plus the signal number for a child the forwarded signal ends", async () => {
    const signal = sample(arbitraryGuardedSignal());

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

  it("closes the supervisor's copy of the descriptor when the child exits", async () => {
    const run = await superviseRealChild(REAL_CHILD_PROGRAM.exitWith(sample(arbitraryExitCode())));

    expect(run.closedDescriptors).toHaveLength(1);
  });

  it("closes the descriptor and restores the listeners when the child cannot be started", async () => {
    const context = createRecordingGuardedContext();

    const running = context.supervisor.run(context.request);
    const failure = new Error(sample(fc.string()));
    context.child.emitError(failure);

    await expect(running).rejects.toBe(failure);
    expect(context.closedDescriptors).toEqual([context.request.descriptor]);
    for (const signal of GUARDED_SIGNALS) {
      expect(context.target.listeners(signal)).toEqual(context.initialListeners.get(signal));
    }
  });

  it("maps a child that ends with neither a code nor a signal to a non-zero status", () => {
    expect(guardedExitStatus(null, null)).not.toBe(0);
  });
});
