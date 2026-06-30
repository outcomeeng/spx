import { describe, expect, it } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { VALIDATION_SUBPROCESS_EVENTS } from "@/validation/steps/subprocess-output";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
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

  it("exposes stdout and stderr as pass-through streams", () => {
    const child = new RecordingValidationChild();
    const stdoutText = sampleLiteralTestValue(arbitraryDomainLiteral());
    const stderrText = sampleLiteralTestValue(arbitraryDomainLiteral());

    child.stdout.write(stdoutText);
    child.stderr.write(stderrText);

    expect(child.stdout.read()?.toString()).toBe(stdoutText);
    expect(child.stderr.read()?.toString()).toBe(stderrText);
  });
});
