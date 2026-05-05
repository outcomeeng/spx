import { describe, expect, it } from "vitest";

import {
  createHandlers,
  createRegistry,
  EPIPE_CODE,
  EPIPE_EXIT_CODE,
  type LifecycleHandlers,
  SIGINT_EXIT_CODE,
  SIGINT_NAME,
  SIGTERM_EXIT_CODE,
  SIGTERM_NAME,
  UNCAUGHT_EVENT_NAME,
  UNCAUGHT_EXIT_CODE,
} from "@/lib/process-lifecycle";
import { RecordingExitController } from "@testing/harnesses/process-lifecycle/lifecycle";

interface SignalCase {
  readonly label: string;
  readonly invoke: (handlers: LifecycleHandlers) => void;
  readonly expectedExit: number;
}

const signalCases: readonly SignalCase[] = [
  { label: SIGINT_NAME, invoke: (h) => h.onSigint(), expectedExit: SIGINT_EXIT_CODE },
  { label: SIGTERM_NAME, invoke: (h) => h.onSigterm(), expectedExit: SIGTERM_EXIT_CODE },
  { label: EPIPE_CODE, invoke: (h) => h.onEpipe(), expectedExit: EPIPE_EXIT_CODE },
  {
    label: UNCAUGHT_EVENT_NAME,
    invoke: (h) => h.onUncaught(new Error()),
    expectedExit: UNCAUGHT_EXIT_CODE,
  },
];

describe("Mapping: signal-to-exit-code", () => {
  it.each(signalCases)("$label maps to exit code $expectedExit", ({ invoke, expectedExit }) => {
    const registry = createRegistry();
    const exitController = new RecordingExitController();
    const handlers = createHandlers({ registry, exitController });

    invoke(handlers);

    expect(exitController.exits).toEqual([expectedExit]);
  });
});
