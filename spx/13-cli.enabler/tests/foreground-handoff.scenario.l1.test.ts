import { describe, expect, it } from "vitest";

import { createSignalSuspender, FOREGROUND_SIGNALS } from "@/lib/process-lifecycle";
import { arbitraryForegroundSignalListeners } from "@testing/generators/process-lifecycle/lifecycle";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { RecordingSignalTarget } from "@testing/harnesses/process-lifecycle/signal-target";

describe("foreground-handoff signal suspender", () => {
  it("replaces each foreground signal's listeners with one ignore listener and reinstates them on restore", () => {
    const originals = sampleGeneratedValue(arbitraryForegroundSignalListeners());
    const target = new RecordingSignalTarget(originals);

    const restore = createSignalSuspender(target).suspend();

    for (const signal of FOREGROUND_SIGNALS) {
      const suspended = target.listeners(signal);
      expect(suspended).toHaveLength(1);
      for (const original of originals.get(signal) ?? []) {
        expect(suspended).not.toContain(original);
      }
    }

    restore();

    for (const signal of FOREGROUND_SIGNALS) {
      expect(target.listeners(signal)).toEqual(originals.get(signal));
    }
  });
});
