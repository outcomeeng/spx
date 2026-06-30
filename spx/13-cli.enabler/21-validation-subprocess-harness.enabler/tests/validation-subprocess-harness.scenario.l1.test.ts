import { describe, expect, it } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { VALIDATION_SUBPROCESS_EVENTS } from "@/validation/steps/subprocess-output";
import { RecordingValidationChild } from "@testing/harnesses/validation/subprocess";

describe("Scenario: recording validation child close control", () => {
  it("emits the validation success close event", () => {
    const child = new RecordingValidationChild();
    const observedCloseCodes: number[] = [];

    child.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code: number) => {
      observedCloseCodes.push(code);
    });

    child.closeSuccessfully();

    expect(observedCloseCodes).toEqual([VALIDATION_EXIT_CODES.SUCCESS]);
  });
});
