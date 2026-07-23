import { describe, expect, it } from "vitest";

import { VALIDATE_SUCCESS_TOKENS } from "@/commands/config/validate";
import { CONFIG_FILENAMES } from "@/config/index";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import {
  withValidateDefaultsSuccessObservation,
  withValidateDescriptorErrorObservation,
  withValidatePresentConfigObservation,
  withValidateProductDirectoryObservation,
  withValidateReadResultObservation,
  withValidateRejectionCodeObservation,
  withValidateResolutionErrorObservation,
} from "@testing/harnesses/config/cli";

describe("validateCommand", () => {
  it("emits a defaults success line when no config file is present", async () => {
    await withValidateDefaultsSuccessObservation(({ productDir, result }) => {
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(VALIDATE_SUCCESS_TOKENS.ABSENT_PREFIX);
      expect(result.stdout).toContain(productDir);
      expect(result.stdout).toContain(VALIDATE_SUCCESS_TOKENS.ABSENT_SUBJECT);
      expect(result.stdout).toContain(VALIDATE_SUCCESS_TOKENS.PASSES_SUFFIX);
      expect(result.stderr).toHaveLength(0);
      for (const filename of Object.values(CONFIG_FILENAMES)) expect(result.stdout).not.toContain(filename);
    });
  });

  it("names the present config file in the success line", async () => {
    await withValidatePresentConfigObservation(({ result }) => {
      expect(result).toMatchObject({ exitCode: 0, stderr: "" });
      expect(result.stdout).toContain(CONFIG_FILENAMES.toml);
    });
  });

  it("exits non-zero when resolution returns an error", async () => {
    await withValidateResolutionErrorObservation(({ result }) => expect(result.exitCode).not.toBe(0));
  });

  it("routes descriptor-qualified resolution errors to stderr", async () => {
    await withValidateDescriptorErrorObservation(({ offendingKind, result }) => {
      expect(result.stderr).toContain(specTreeConfigDescriptor.section);
      expect(result.stderr).toContain(offendingKind);
      expect(result.stdout).toHaveLength(0);
    });
  });

  it("uses exit code 1 on rejection", async () => {
    await withValidateRejectionCodeObservation(({ result }) => expect(result.exitCode).toBe(1));
  });

  it("resolves the product directory before reading the config file", async () => {
    await withValidateProductDirectoryObservation(({ observedProductDir, productDir }) => {
      expect(observedProductDir).toBe(productDir);
    });
  });

  it("validates the read result that supplies the success filename", async () => {
    await withValidateReadResultObservation(({ expectedReadResult, observedReadResult, result }) => {
      expect(observedReadResult).toBe(expectedReadResult);
      expect(result.stdout).toContain(CONFIG_FILENAMES.json);
    });
  });
});
