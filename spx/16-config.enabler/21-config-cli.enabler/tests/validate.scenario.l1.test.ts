import { describe, it } from "vitest";

import {
  assertValidateDefaultsSuccessLine,
  assertValidateExactRejectionExitCode,
  assertValidatePresentConfigSuccessLine,
  assertValidateReadsResolvedProductDirectory,
  assertValidateRejectsResolutionError,
  assertValidateReportsDescriptorError,
  assertValidateUsesReadResultForResolution,
} from "@testing/harnesses/config/cli";

describe("validateCommand", () => {
  it("emits a defaults success line when no config file is present", async () => {
    await assertValidateDefaultsSuccessLine();
  });

  it("names the present config file in the success line", async () => {
    await assertValidatePresentConfigSuccessLine();
  });

  it("exits non-zero when resolution returns an error", async () => {
    await assertValidateRejectsResolutionError();
  });

  it("routes descriptor-qualified resolution errors to stderr", async () => {
    await assertValidateReportsDescriptorError();
  });

  it("uses exit code 1 on rejection", async () => {
    await assertValidateExactRejectionExitCode();
  });

  it("resolves the product directory before reading the config file", async () => {
    await assertValidateReadsResolvedProductDirectory();
  });

  it("validates the read result that supplies the success filename", async () => {
    await assertValidateUsesReadResultForResolution();
  });
});
