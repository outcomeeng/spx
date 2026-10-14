import { describe, expect, it } from "vitest";

import { VALIDATION_SCOPES } from "@/validation/types";
import {
  dispatchValidationAll,
  sampleValidationSourceDirectoryPath,
  sampleValidationSourceFilePath,
  validationProductionScopeOperands,
} from "@testing/harnesses/validation/cli";

describe("validation all CLI scope forwarding", () => {
  it("forwards production scope to the full-pipeline handler", async () => {
    const dispatch = await dispatchValidationAll(validationProductionScopeOperands());

    expect(dispatch.result.exitCode).toBe(0);
    expect(dispatch.calls).toHaveLength(1);
    expect(dispatch.calls[0]?.options.scope).toBe(VALIDATION_SCOPES.PRODUCTION);
  });

  it("forwards a positional file operand to the full-pipeline handler", async () => {
    const filePath = sampleValidationSourceFilePath();

    const dispatch = await dispatchValidationAll([filePath]);

    expect(dispatch.result.exitCode).toBe(0);
    expect(dispatch.calls).toHaveLength(1);
    expect(dispatch.calls[0]?.options.files).toEqual([filePath]);
    expect(dispatch.calls[0]?.options.scope).toBe(VALIDATION_SCOPES.FULL);
  });

  it("forwards a positional directory operand to the full-pipeline handler", async () => {
    const directoryPath = sampleValidationSourceDirectoryPath();

    const dispatch = await dispatchValidationAll([directoryPath]);

    expect(dispatch.result.exitCode).toBe(0);
    expect(dispatch.calls).toHaveLength(1);
    expect(dispatch.calls[0]?.options.files).toEqual([directoryPath]);
    expect(dispatch.calls[0]?.options.scope).toBe(VALIDATION_SCOPES.FULL);
  });
});
