import {
  assertPrecommitEntrypointsRecognizeDirectExecution,
  assertPrecommitEntrypointsRejectMismatchedArgv,
} from "@testing/harnesses/precommit/entrypoint";
import { describe, it } from "vitest";

describe("isDirectPrecommitEntrypoint", () => {
  it("maps POSIX and Windows argv paths for the invoked precommit script to direct execution", () => {
    assertPrecommitEntrypointsRecognizeDirectExecution();
  });

  it("maps a mismatched argv path to not-direct execution", () => {
    assertPrecommitEntrypointsRejectMismatchedArgv();
  });
});
