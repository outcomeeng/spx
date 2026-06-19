/**
 * runPicker launch/quit wiring scenarios.
 *
 * Drives `runPicker` through an injected render seam — the production default
 * is Ink's `render` — that captures the picker props and resolves its
 * `waitUntilExit` only when `unmount` is called. Firing `onLaunch` therefore
 * proves the launch path unmounts (otherwise the awaited promise never
 * resolves). The session, runtime, and flag are generated.
 */

import * as fc from "fast-check";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { PICKER_RUNTIME, type PickerRuntime } from "@/domains/session/pick-model";
import type { Session } from "@/domains/session/types";
import { type PickerInstance, type PickerRenderer, runPicker } from "@/interfaces/cli/session/pick/run-picker";
import type { SessionPickerProps } from "@/interfaces/cli/session/pick/SessionPicker";
import { arbitraryClaimableSession } from "@testing/generators/session/session";

/** Draw a single value from an arbitrary for an example-based scenario. */
function sample<T>(arbitrary: fc.Arbitrary<T>): T {
  return fc.sample(arbitrary, 1)[0];
}

/** A render seam capturing the picker props; `unmount` resolves the exit promise. */
function fakeRenderer(): {
  render: PickerRenderer;
  launch: (session: Session, runtime: PickerRuntime, autoContinue: boolean) => void;
  quit: () => void;
} {
  let resolveExit = (): void => {};
  const exited = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });
  let props: SessionPickerProps | null = null;

  const render: PickerRenderer = (element: ReactElement): PickerInstance => {
    props = element.props as SessionPickerProps;
    return {
      unmount: () => resolveExit(),
      waitUntilExit: () => exited,
    };
  };

  return {
    render,
    launch: (session, runtime, autoContinue) => props?.onLaunch(session, runtime, autoContinue),
    quit: () => props?.onQuit(),
  };
}

describe("runPicker launch and quit wiring", () => {
  it("unmounts and resolves the chosen session when the operator launches", async () => {
    const session = sample(arbitraryClaimableSession());
    const runtime = sample(fc.constantFrom(...Object.values(PICKER_RUNTIME)));
    const autoContinue = sample(fc.boolean());
    const harness = fakeRenderer();

    const pending = runPicker([session], harness.render);
    harness.launch(session, runtime, autoContinue);

    expect(await pending).toEqual({ session, runtime, autoContinue });
  });

  it("unmounts and resolves no choice when the operator quits", async () => {
    const session = sample(arbitraryClaimableSession());
    const harness = fakeRenderer();

    const pending = runPicker([session], harness.render);
    harness.quit();

    expect(await pending).toBeNull();
  });
});
