import { describe, expect, it } from "vitest";

import {
  createHandlers,
  createRegistry,
  EPIPE_CODE,
  type LifecycleHandlers,
  lifecycleProcessRunner,
  SIGINT_NAME,
  SIGTERM_NAME,
  UNCAUGHT_EVENT_NAME,
} from "@/lib/process-lifecycle";
import { defaultEslintProcessRunner } from "@/validation/steps/eslint";
import { defaultFormattingProcessRunner } from "@/validation/steps/formatting";
import { defaultKnipProcessRunner } from "@/validation/steps/knip";
import { defaultTypeScriptProcessRunner } from "@/validation/steps/typescript";
import { LIFECYCLE_EXIT_ORACLE } from "@testing/generators/process-lifecycle/lifecycle";
import { RecordingExitController } from "@testing/harnesses/process-lifecycle/lifecycle";

describe("Mapping: lifecycle event to exit code", () => {
  // The four rows are the four lifecycle events the spec maps; each expected code comes from
  // the independent oracle — POSIX 128 + signal number, pipe-close success, generic failure.
  it.each([
    {
      event: SIGINT_NAME,
      fire: (handlers: LifecycleHandlers) => handlers.onSigint(),
      expectedExit: LIFECYCLE_EXIT_ORACLE.signalExitCode(SIGINT_NAME),
    },
    {
      event: SIGTERM_NAME,
      fire: (handlers: LifecycleHandlers) => handlers.onSigterm(),
      expectedExit: LIFECYCLE_EXIT_ORACLE.signalExitCode(SIGTERM_NAME),
    },
    {
      event: EPIPE_CODE,
      fire: (handlers: LifecycleHandlers) => handlers.onEpipe(),
      expectedExit: LIFECYCLE_EXIT_ORACLE.DOWNSTREAM_CLOSED_PIPE,
    },
    {
      event: UNCAUGHT_EVENT_NAME,
      fire: (handlers: LifecycleHandlers) => handlers.onUncaught(new Error()),
      expectedExit: LIFECYCLE_EXIT_ORACLE.INTERNAL_FAILURE,
    },
  ])("$event maps to exit code $expectedExit", ({ fire, expectedExit }) => {
    const exitController = new RecordingExitController();

    fire(createHandlers({ registry: createRegistry(), exitController }));

    expect(exitController.exits).toEqual([expectedExit]);
  });
});

describe("Mapping: validation ProcessRunner defaults", () => {
  it.each([
    defaultEslintProcessRunner,
    defaultFormattingProcessRunner,
    defaultKnipProcessRunner,
    defaultTypeScriptProcessRunner,
  ])("validation runner %# maps to the shared lifecycle runner", (runner) => {
    expect(runner).toBe(lifecycleProcessRunner);
  });
});
