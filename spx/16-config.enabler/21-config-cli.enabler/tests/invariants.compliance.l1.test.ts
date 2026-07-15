import { describe, it } from "vitest";

import {
  assertConfigCommandsExposePresentationOptionsOnly,
  assertConfigHandlersResolveResults,
  assertDefaultsHasNoDirectProcessEffects,
  assertFailedResolutionUsesStderr,
  assertHandlersCannotWriteFilesOrSpawnAndPreserveEnvironment,
  assertShowHasNoDirectProcessEffects,
  assertSuccessfulShowAndDefaultsUseStdout,
  assertSuccessfulValidateUsesStdout,
  assertValidateRejectionHasNoDirectProcessEffects,
  assertValidateSuccessHasNoDirectProcessEffects,
} from "@testing/harnesses/config/cli";

describe("invariants — handlers trigger no process side effects (P1)", () => {
  it("showCommand does not call process.exit, process.chdir, or write to process streams", async () => {
    await assertShowHasNoDirectProcessEffects();
  });

  it("validateCommand does not call process.exit, process.chdir, or write to process streams on the success path", async () => {
    await assertValidateSuccessHasNoDirectProcessEffects();
  });

  it("validateCommand does not call process.exit, process.chdir, or write to process streams on the rejection path", async () => {
    await assertValidateRejectionHasNoDirectProcessEffects();
  });

  it("defaultsCommand does not call process.exit, process.chdir, or write to process streams", async () => {
    await assertDefaultsHasNoDirectProcessEffects();
  });

  it("handlers cannot write files or spawn subprocesses and preserve process.env", async () => {
    await assertHandlersCannotWriteFilesOrSpawnAndPreserveEnvironment();
  });
});

describe("invariants — config source scope", () => {
  it("registers presentation options only, with no alternate config source", () => {
    assertConfigCommandsExposePresentationOptionsOnly();
  });
});

describe("invariants — handlers do not throw, even on rejection", () => {
  it("every handler resolves to a CliResult for both ok and error inputs — no thrown exceptions", async () => {
    await assertConfigHandlersResolveResults();
  });
});

describe("invariants — stream discipline (C2)", () => {
  it("successful show/defaults route the resolved Config to stdout; stderr is empty", async () => {
    await assertSuccessfulShowAndDefaultsUseStdout();
  });

  it("failed resolution in show/validate routes diagnostics to stderr and leaves stdout empty", async () => {
    await assertFailedResolutionUsesStderr();
  });

  it("successful validate emits the success line on stdout, not stderr", async () => {
    await assertSuccessfulValidateUsesStdout();
  });
});
