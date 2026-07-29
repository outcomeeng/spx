import { describe, expect, it } from "vitest";

import { VALIDATE_SUCCESS_TOKENS } from "@/commands/config/validate";
import { CONFIG_CLI } from "@/interfaces/cli/config";
import {
  CONFIG_EFFECT_SENTINEL_PROBE_EFFECTS,
  withConfigCommandOptionsObservation,
  withConfigHandlerResultsObservation,
  withDefaultsProcessEffectsObservation,
  withFailedResolutionOutputObservation,
  withHandlerEffectSentinelObservation,
  withShowProcessEffectsObservation,
  withSuccessfulOutputObservation,
  withSuccessfulValidateOutputObservation,
  withValidateRejectionProcessEffectsObservation,
  withValidateSuccessProcessEffectsObservation,
} from "@testing/harnesses/config/cli";

describe("invariants — handlers trigger no process side effects (P1)", () => {
  it("showCommand does not call process.exit, process.chdir, or write to process streams", async () => {
    await withShowProcessEffectsObservation(({ effects }) => expect(effects).toEqual([]));
  });

  it("validateCommand does not call process.exit, process.chdir, or write to process streams on the success path", async () => {
    await withValidateSuccessProcessEffectsObservation(({ effects }) => expect(effects).toEqual([]));
  });

  it("validateCommand does not call process.exit, process.chdir, or write to process streams on the rejection path", async () => {
    await withValidateRejectionProcessEffectsObservation(({ effects }) => expect(effects).toEqual([]));
  });

  it("defaultsCommand does not call process.exit, process.chdir, or write to process streams", async () => {
    await withDefaultsProcessEffectsObservation(({ effects }) => expect(effects).toEqual([]));
  });

  it("handlers cannot write files or spawn subprocesses and preserve process.env", async () => {
    await withHandlerEffectSentinelObservation(({ observation, sentinelResult }) => {
      expect(sentinelResult).toMatchObject({ exitCode: 0, stderr: "" });
      expect(observation.probeAttemptedEffects).toEqual(CONFIG_EFFECT_SENTINEL_PROBE_EFFECTS);
      expect(observation.handlerAttemptedEffects).toEqual([]);
      expect(observation.handlerErrors).toEqual([]);
      expect(observation.cwdAfter).toBe(observation.cwdBefore);
      expect(observation.changedEnvironmentKeys).toEqual([]);
    });
  });
});

describe("invariants — config source scope", () => {
  it("registers presentation options only, with no alternate config source", () => {
    withConfigCommandOptionsObservation(({ optionFlags }) => {
      expect(optionFlags).toEqual([CONFIG_CLI.flags.json, CONFIG_CLI.flags.json]);
    });
  });
});

describe("invariants — handlers do not throw, even on rejection", () => {
  it("every handler resolves to a CliResult for both ok and error inputs — no thrown exceptions", async () => {
    await withConfigHandlerResultsObservation(({ defaults, show, showAgain, validate, validateAgain }) => {
      expect(defaults.exitCode).toBe(0);
      expect(show.exitCode).toBe(0);
      expect(showAgain.exitCode).toEqual(expect.any(Number));
      expect(validate.exitCode).toBe(0);
      expect(validateAgain.exitCode).toEqual(expect.any(Number));
    });
  });
});

describe("invariants — stream discipline (C2)", () => {
  it("successful show/defaults route the resolved Config to stdout; stderr is empty", async () => {
    await withSuccessfulOutputObservation(({ defaults, show }) => {
      expect(show.stdout.length).toBeGreaterThan(0);
      expect(show.stderr).toHaveLength(0);
      expect(defaults.stdout.length).toBeGreaterThan(0);
      expect(defaults.stderr).toHaveLength(0);
    });
  });

  it("failed resolution in show/validate routes diagnostics to stderr and leaves stdout empty", async () => {
    await withFailedResolutionOutputObservation(({ show, validate }) => {
      expect(show.stdout).toHaveLength(0);
      expect(show.stderr.length).toBeGreaterThan(0);
      expect(validate.stdout).toHaveLength(0);
      expect(validate.stderr.length).toBeGreaterThan(0);
    });
  });

  it("successful validate emits the success line on stdout, not stderr", async () => {
    await withSuccessfulValidateOutputObservation(({ productDir, result }) => {
      expect(result.stdout).toContain(VALIDATE_SUCCESS_TOKENS.ABSENT_PREFIX);
      expect(result.stdout).toContain(productDir);
      expect(result.stdout).toContain(VALIDATE_SUCCESS_TOKENS.ABSENT_SUBJECT);
      expect(result.stdout).toContain(VALIDATE_SUCCESS_TOKENS.PASSES_SUFFIX);
      expect(result.stderr).toHaveLength(0);
    });
  });
});
