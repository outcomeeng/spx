import { describe, expect, it } from "vitest";

import { VALIDATION_SUBPROCESS_EVENTS } from "@/validation/steps/subprocess-output";
import {
  sampleValidationSubprocessText,
  VALIDATION_SUBPROCESS_EXPECTED_SUCCESS_EXIT_CODE,
} from "@testing/generators/validation/subprocess";
import { RecordingValidationChild } from "@testing/harnesses/validation/subprocess";

describe("Scenario: recording validation child", () => {
  it("delivers exit code 0 exactly once to its close listener when it closes successfully", () => {
    const child = new RecordingValidationChild();
    const observedCloseCodes: unknown[] = [];

    child.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code: unknown) => {
      observedCloseCodes.push(code);
    });

    child.closeSuccessfully();

    expect(observedCloseCodes).toEqual([VALIDATION_SUBPROCESS_EXPECTED_SUCCESS_EXIT_CODE]);
  });

  it("yields from stdout and stderr the text written to each stream", () => {
    const child = new RecordingValidationChild();
    const stdoutText = sampleValidationSubprocessText();
    const stderrText = sampleValidationSubprocessText();

    child.stdout.write(stdoutText);
    child.stderr.write(stderrText);

    expect(child.stdout.read()?.toString()).toBe(stdoutText);
    expect(child.stderr.read()?.toString()).toBe(stderrText);
  });
});
